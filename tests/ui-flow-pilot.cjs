const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const C = require('../domain.js');

function classList() {
  const values = new Set();
  return { toggle(name, enabled) { if (enabled) values.add(name); else values.delete(name); } };
}
function node(id) {
  return { id, innerHTML: '', value: '', attributes: {}, handlers: {}, classList: classList(), setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(type, handler) { this.handlers[type] = handler; } };
}
function target(matches, dataset) {
  return { dataset: dataset || {}, closest(selector) { return matches.includes(selector) ? this : null; } };
}
function chooseDate(day) {
  listeners.click({ target: target(['[data-date-calendar-toggle]']) });
  listeners.click({ target: target(['[data-calendar-day]'], { calendarDay: day }) });
}

const storage = new Map();
const LANGUAGE_KEY = 'billiard-city-language-v1';
// This file exercises the established Russian copy separately from the
// first-visit language requirement covered in reliability-pilot.cjs.
storage.set(LANGUAGE_KEY, 'ru');
const listeners = {};
const clientNodes = ['booking-wizard', 'wizard-app', 'account-panel', 'account-content'].reduce((all, id) => ({ ...all, [id]: node(id) }), {});
const clientDocument = {
  getElementById(id) { return clientNodes[id]; },
  querySelector() { return null; },
  addEventListener(type, handler) { listeners[type] = handler; }
};
const localStorage = { getItem(key) { return storage.has(key) ? storage.get(key) : null; }, setItem(key, value) { storage.set(key, value); } };
const clientWindow = { BilliardCityDomain: C, addEventListener() {}, confirm() { return true; } };
const clientContext = vm.createContext({ window: clientWindow, document: clientDocument, localStorage, requestAnimationFrame(callback) { callback(); }, Date, Intl, console });
vm.runInContext(fs.readFileSync(require.resolve('../app.js'), 'utf8'), clientContext);

const day = C.plusDays(C.keyForDate(new Date()), 7);
const STORAGE_KEY = 'billiard-city-client-first-v1';
const seededState = JSON.parse(localStorage.getItem(STORAGE_KEY));
seededState.bookings.push({ id: 'next-pyramid-booking', tableId: 'pyramid-3', day, start: 18, duration: 2, status: 'confirmed', source: 'demo', name: 'Следующий гость', phone: '' });
localStorage.setItem(STORAGE_KEY, JSON.stringify(seededState));

listeners.click({ target: target(['[data-start-booking]']) });
assert(clientNodes['wizard-app'].innerHTML.includes('7 столов'));
listeners.click({ target: target(['[data-type]'], { type: 'pyramid' }) });
assert(clientNodes['wizard-app'].innerHTML.includes('class="date-choice-other"'));
assert(!clientNodes['wizard-app'].innerHTML.includes('data-other-day'));
chooseDate(day);
const hourlyMarkup = clientNodes['wizard-app'].innerHTML;
assert(hourlyMarkup.includes('<i>12</i>'));
assert(hourlyMarkup.includes('<i>23</i>'));
assert(!hourlyMarkup.includes('Быстрый выбор'));
assert(!hourlyMarkup.includes(':15</i>'));

listeners.click({ target: target(['[data-hour-table]'], { hourTable: 'pyramid-3', hourStart: String(16 * 60) }) });
const exactMarkup = clientNodes['wizard-app'].innerHTML;
['16:00', '16:15', '16:30', '16:45'].forEach(time => assert(exactMarkup.includes('>' + time + '<')));
assert(!exactMarkup.includes('>17:00<'));
assert(exactMarkup.includes('data-continue-time'));
listeners.click({ target: target(['[data-exact-start]'], { exactStart: String(16 * 60 + 30) }) });
assert(!clientNodes['wizard-app'].innerHTML.includes('data-continue-time disabled'));
listeners.click({ target: target(['[data-continue-time]']) });
const durationMarkup = clientNodes['wizard-app'].innerHTML;
assert(durationMarkup.includes('Этот стол свободен до 18:00. Максимальная продолжительность — 1 ч 30 мин.'));
assert(durationMarkup.includes('value="60"'));
assert(durationMarkup.includes('value="75"'));
assert(durationMarkup.includes('value="90"'));
assert(!durationMarkup.includes('value="105"'));
listeners.change({ target: { id: 'duration-select', value: '75' } });
assert(clientNodes['wizard-app'].innerHTML.includes('Проверьте бронь'));
listeners.click({ target: target(['[data-back]']) });
assert(clientNodes['wizard-app'].innerHTML.includes('Выберите длительность'));
listeners.change({ target: { id: 'duration-select', value: '90' } });
assert(clientNodes['wizard-app'].innerHTML.includes('Проверьте бронь'));
assert(!JSON.parse(localStorage.getItem(STORAGE_KEY)).bookings.some(item => item.name === 'Тестовый гость'));
listeners.submit({ preventDefault() {}, target: { id: 'booking-form', elements: { name: { value: 'Тестовый гость' }, phone: { value: '+380501234567' } } } });
assert(clientNodes['wizard-app'].innerHTML.includes('Бронь успешно подтверждена'));

const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
const booking = state.bookings.find(item => item.name === 'Тестовый гость');
assert.deepStrictEqual({ start: booking.start, duration: booking.duration }, { start: 16 * 60 + 30, duration: 90 });
const resultMarkup = clientNodes['wizard-app'].innerHTML;
assert(resultMarkup.includes('Бронь бесплатна и уже сохранена. Предоплата не требуется.'));
assert(resultMarkup.includes('Хотите создать личный кабинет?'));
assert(resultMarkup.includes('Создать личный кабинет'));
assert(resultMarkup.includes('Может быть, позже'));
assert(resultMarkup.includes('data-club-menu'));
assert(resultMarkup.includes('data-new-booking'));
assert(resultMarkup.includes('data-home'));

listeners.click({ target: target(['[data-account-later]']) });
assert(clientNodes['wizard-app'].innerHTML.includes('Личный кабинет можно создать позже через кнопку «Кабинет».'));
assert.strictEqual(JSON.parse(localStorage.getItem(STORAGE_KEY)).profile.accountCreated, false);
listeners.click({ target: target(['[data-club-menu]']) });
assert(clientNodes['wizard-app'].innerHTML.includes('Меню, состав блюд и цены будут добавлены владельцем клуба отдельно.'));
listeners.click({ target: target(['[data-food-order]']) });
assert(clientNodes['wizard-app'].innerHTML.includes('заказ не создаётся, не отправляется в клуб и не требует оплаты'));
listeners.click({ target: target(['[data-club-menu]']) });
listeners.click({ target: target(['[data-back]']) });
assert(clientNodes['wizard-app'].innerHTML.includes('Бронь успешно подтверждена'));

listeners.click({ target: target(['[data-account-open]']) });
assert(clientNodes['account-content'].innerHTML.includes('data-create-account'));
listeners.click({ target: target(['[data-create-account]']) });
assert.strictEqual(JSON.parse(localStorage.getItem(STORAGE_KEY)).profile.accountCreated, true);
assert.strictEqual(JSON.parse(localStorage.getItem(STORAGE_KEY)).bookings.find(item => item.id === booking.id).status, 'confirmed');
assert(clientNodes['account-content'].innerHTML.includes('Личный кабинет'));
assert(clientNodes['account-content'].innerHTML.includes('data-home'));
listeners.click({ target: target(['[data-home]']) });
assert.strictEqual(clientNodes['wizard-app'].innerHTML, '');

// A newly saved booking narrows later starts on the same table, and closing at 23:00
// leaves only 22:00 as a valid one-hour start in the final hour.
listeners.click({ target: target(['[data-start-booking]']) });
listeners.click({ target: target(['[data-type]'], { type: 'pyramid' }) });
chooseDate(day);
listeners.click({ target: target(['[data-hour-table]'], { hourTable: 'pyramid-3', hourStart: String(15 * 60) }) });
const conflictMarkup = clientNodes['wizard-app'].innerHTML;
['15:00', '15:15', '15:30'].forEach(time => assert(conflictMarkup.includes('>' + time + '<')));
assert(!conflictMarkup.includes('>15:45<'));
listeners.click({ target: target(['[data-hour-table]'], { hourTable: 'pyramid-3', hourStart: String(22 * 60) }) });
const closingMarkup = clientNodes['wizard-app'].innerHTML;
assert(closingMarkup.includes('>22:00<'));
['22:15', '22:30', '22:45'].forEach(time => assert(!closingMarkup.includes('>' + time + '<')));

// No next booking leaves the full remaining working day available, without a 2–4 hour cap.
listeners.click({ target: target(['[data-close-wizard]']) });
listeners.click({ target: target(['[data-start-booking]']) });
listeners.click({ target: target(['[data-type]'], { type: 'pyramid' }) });
chooseDate(day);
listeners.click({ target: target(['[data-hour-table]'], { hourTable: 'pyramid-4', hourStart: String(15 * 60) }) });
listeners.click({ target: target(['[data-exact-start]'], { exactStart: String(15 * 60 + 15) }) });
listeners.click({ target: target(['[data-continue-time]']) });
const noNextMarkup = clientNodes['wizard-app'].innerHTML;
assert(noNextMarkup.includes('Следующей брони нет. Стол доступен до закрытия в 23:00. Максимальная продолжительность — 7 ч 45 мин.'));
assert(noNextMarkup.includes('value="465"'));
assert(!noNextMarkup.includes('value="480"'));
assert(noNextMarkup.includes('Выбрать другой стол или время'));
listeners.click({ target: target(['[data-back]']) });
assert(clientNodes['wizard-app'].innerHTML.includes('Выберите свободный стол и время'));

const adminNodes = ['admin-day', 'admin-stats', 'admin-schedule', 'future-bookings', 'food-list'].reduce((all, id) => ({ ...all, [id]: node(id) }), {});
const adminDocument = { getElementById(id) { return adminNodes[id]; } };
const adminWindow = { BilliardCityDomain: C, addEventListener() {} };
const adminContext = vm.createContext({ window: adminWindow, document: adminDocument, localStorage, Date, Intl, console });
vm.runInContext(fs.readFileSync(require.resolve('../admin/admin.js'), 'utf8'), adminContext);
adminNodes['admin-day'].value = day;
const adminChange = adminNodes['admin-day'].handlers.change;
assert(adminChange, 'admin date-change listener is registered');
adminChange({ target: { value: day } });
assert(adminNodes['admin-schedule'].innerHTML.includes('Начало 16:30 · 1 ч 30 мин · окончание 18:00'));

console.log('UI flow pilot passed: exact time, 15-minute duration, voluntary account, club menu, food handoff and admin time.');
