const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const C = require('../domain.js');

const APP_SOURCE = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const STORAGE_KEY = 'billiard-city-client-first-v1';
const LEGACY_STORAGE_KEY = 'luza-client-first-demo-v1';
const LANGUAGE_KEY = 'billiard-city-language-v1';

// Date selection uses the site's own calendar, never a native segmented field.
assert(!APP_SOURCE.includes('showPicker('));
assert(!APP_SOURCE.includes('data-other-day'));
assert(!APP_SOURCE.includes('type="date"'));

function classList() { return { toggle() {} }; }
function node(id) { return { id, innerHTML: '', attributes: {}, classList: classList(), setAttribute(name, value) { this.attributes[name] = value; } }; }
function target(matches, dataset) { return { dataset: dataset || {}, closest(selector) { return matches.includes(selector) ? this : null; } }; }
function mapStorage(initial, writeError) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { if (writeError) throw new Error('storage full'); values.set(key, value); },
    values
  };
}
function createHarness(options) {
  options = options || {};
  const listeners = {};
  if (options.language !== false) {
    try { options.storage.setItem(LANGUAGE_KEY, options.language || 'ru'); } catch (error) { /* The blocked-storage test intentionally cannot persist a choice. */ }
  }
  const nodes = ['booking-wizard', 'wizard-app', 'account-panel', 'account-content'].reduce((all, id) => ({ ...all, [id]: node(id) }), {});
  const document = { getElementById(id) { return nodes[id]; }, querySelector() { return null; }, addEventListener(type, listener) { listeners[type] = listener; } };
  let confirmation = options.confirmation !== false;
  const window = { BilliardCityDomain: C, addEventListener() {}, confirm() { return confirmation; } };
  vm.runInContext(APP_SOURCE, vm.createContext({ window, document, localStorage: options.storage, requestAnimationFrame(callback) { callback(); }, Date: options.DateImpl || Date, Intl, console }));
  return { nodes, listeners, storage: options.storage, setConfirmation(value) { confirmation = value; } };
}
function startToConfirm(harness, day) {
  harness.listeners.click({ target: target(['[data-start-booking]']) });
  harness.listeners.click({ target: target(['[data-type]'], { type: 'pyramid' }) });
  harness.listeners.click({ target: target(['[data-date-calendar-toggle]']) });
  harness.listeners.click({ target: target(['[data-calendar-day]'], { calendarDay: day }) });
  harness.listeners.click({ target: target(['[data-hour-table]'], { hourTable: 'pyramid-1', hourStart: '720' }) });
  harness.listeners.click({ target: target(['[data-exact-start]'], { exactStart: '720' }) });
  harness.listeners.click({ target: target(['[data-continue-time]']) });
  harness.listeners.change({ target: { id: 'duration-select', value: '60' } });
}

// Previous locally stored demonstration data is copied to the new name, not discarded.
const legacyState = { version: 2, profile: { name: 'Гость', phone: '+380501234567', accountCreated: false }, bookings: [] };
const migratedStorage = mapStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify(legacyState) });
createHarness({ storage: migratedStorage });
assert.deepStrictEqual(JSON.parse(migratedStorage.getItem(STORAGE_KEY)).profile, legacyState.profile);
assert.strictEqual(migratedStorage.getItem(LEGACY_STORAGE_KEY), JSON.stringify(legacyState));

// A phone is normalized before save, while arbitrary text is rejected.
const phoneStorage = mapStorage();
const phoneHarness = createHarness({ storage: phoneStorage });
const day = C.plusDays(C.keyForDate(new Date()), 7);
startToConfirm(phoneHarness, day);
phoneHarness.listeners.submit({ preventDefault() {}, target: { id: 'booking-form', elements: { name: { value: 'Тест' }, phone: { value: 'abc' } } } });
assert(phoneHarness.nodes['wizard-app'].innerHTML.includes('Введите корректный номер телефона'));
assert(!JSON.parse(phoneStorage.getItem(STORAGE_KEY)).bookings.some(booking => booking.name === 'Тест'));
phoneHarness.listeners.submit({ preventDefault() {}, target: { id: 'booking-form', elements: { name: { value: 'Тест' }, phone: { value: '050 123 45 67' } } } });
const normalizedBooking = JSON.parse(phoneStorage.getItem(STORAGE_KEY)).bookings.find(booking => booking.name === 'Тест');
assert.strictEqual(normalizedBooking.phone, '+380501234567');

// A cancellation changes data only after an explicit confirmation.
const cancellationStorage = mapStorage();
const cancellationHarness = createHarness({ storage: cancellationStorage, confirmation: false });
cancellationHarness.listeners.click({ target: target(['[data-cancel]'], { cancel: 'demo-pyramid' }) });
assert.strictEqual(JSON.parse(cancellationStorage.getItem(STORAGE_KEY)).bookings.find(booking => booking.id === 'demo-pyramid').status, 'confirmed');
cancellationHarness.setConfirmation(true);
cancellationHarness.listeners.click({ target: target(['[data-cancel]'], { cancel: 'demo-pyramid' }) });
assert.strictEqual(JSON.parse(cancellationStorage.getItem(STORAGE_KEY)).bookings.find(booking => booking.id === 'demo-pyramid').status, 'cancelled');

// Failed writes never lead to a success screen.
const writeFailureState = { version: 2, profile: { name: '', phone: '', accountCreated: false }, bookings: [] };
const writeFailureStorage = mapStorage({ [STORAGE_KEY]: JSON.stringify(writeFailureState) }, true);
const writeFailureHarness = createHarness({ storage: writeFailureStorage });
startToConfirm(writeFailureHarness, day);
writeFailureHarness.listeners.submit({ preventDefault() {}, target: { id: 'booking-form', elements: { name: { value: 'Тест' }, phone: { value: '+380501234567' } } } });
assert(!writeFailureHarness.nodes['wizard-app'].innerHTML.includes('Бронь успешно подтверждена'));
assert(writeFailureHarness.nodes['wizard-app'].innerHTML.includes('Бронювання не підтверджено'));

// Blocked and malformed localStorage are reported rather than crashing or being overwritten.
const blockedStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
const blockedHarness = createHarness({ storage: blockedStorage });
blockedHarness.listeners.click({ target: target(['[data-start-booking]']) });
assert(blockedHarness.nodes['wizard-app'].innerHTML.includes('Локальне сховище недоступне'));
const corruptStorage = mapStorage({ [STORAGE_KEY]: '{not json' });
const corruptHarness = createHarness({ storage: corruptStorage });
corruptHarness.listeners.click({ target: target(['[data-start-booking]']) });
assert(corruptHarness.nodes['wizard-app'].innerHTML.includes('Локальные данные повреждены'));
assert.strictEqual(corruptStorage.getItem(STORAGE_KEY), '{not json');

// Fully elapsed hours are visibly different from a booking conflict.
const fixedMoment = new Date(2030, 4, 20, 19, 30, 0, 0);
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedMoment.getTime()])); } static now() { return fixedMoment.getTime(); } }
const pastStorage = mapStorage();
const pastHarness = createHarness({ storage: pastStorage, DateImpl: FixedDate });
pastHarness.listeners.click({ target: target(['[data-start-booking]']) });
pastHarness.listeners.click({ target: target(['[data-type]'], { type: 'pyramid' }) });
pastHarness.listeners.click({ target: target(['[data-today]']) });
assert(pastHarness.nodes['wizard-app'].innerHTML.includes('hour-cell is-past'));
assert(pastHarness.nodes['wizard-app'].innerHTML.includes('Время прошло'));

// Opening the custom calendar keeps the date step active. Selecting a future
// day is the only action that advances to that date's schedule.
const calendarStorage = mapStorage();
const calendarHarness = createHarness({ storage: calendarStorage });
const today = C.keyForDate(new Date());
const futureDay = C.plusDays(today, 3);
calendarHarness.listeners.click({ target: target(['[data-start-booking]']) });
calendarHarness.listeners.click({ target: target(['[data-type]'], { type: 'pyramid' }) });
assert(calendarHarness.nodes['wizard-app'].innerHTML.includes('class="date-choice-other"'));
calendarHarness.listeners.click({ target: target(['[data-date-calendar-toggle]']) });
assert(calendarHarness.nodes['wizard-app'].innerHTML.includes('data-date-calendar'));
assert(calendarHarness.nodes['wizard-app'].innerHTML.includes('data-calendar-day="' + today + '" aria-label='));
calendarHarness.listeners.click({ target: target(['[data-calendar-day]'], { calendarDay: today, disabled: true }) });
assert(calendarHarness.nodes['wizard-app'].innerHTML.includes('data-date-calendar'));
calendarHarness.listeners.click({ target: target(['[data-calendar-day]'], { calendarDay: futureDay }) });
assert(calendarHarness.nodes['wizard-app'].innerHTML.includes('Выберите свободный стол и время'));

// Ukrainian is the first-visit default; a later choice is remembered separately
// from bookings and immediately translates the active booking screen.
const languageStorage = mapStorage();
const languageHarness = createHarness({ storage: languageStorage, language: false });
languageHarness.listeners.click({ target: target(['[data-start-booking]']) });
assert(languageHarness.nodes['wizard-app'].innerHTML.includes('Оберіть тип гри'));
languageHarness.listeners.click({ target: target(['[data-language-choice]'], { languageChoice: 'en' }) });
assert.strictEqual(languageStorage.getItem(LANGUAGE_KEY), 'en');
assert(languageHarness.nodes['wizard-app'].innerHTML.includes('Choose a game'));
const returningLanguageHarness = createHarness({ storage: languageStorage, language: false });
returningLanguageHarness.listeners.click({ target: target(['[data-start-booking]']) });
assert(returningLanguageHarness.nodes['wizard-app'].innerHTML.includes('Choose a game'));

console.log('Reliability pilot passed: storage, phone normalization, cancellation confirmation, elapsed hours and language persistence.');
