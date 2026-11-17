(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BilliardCityDomain = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Temporary schedule. `closesAt: 2` is interpreted as 02:00 on the next day.
  // Change this object only; availability, durations and price calculation follow it.
  var CLUB_HOURS = { opensAt: 12, closesAt: 23 };
  var SLOT_MINUTES = 15;
  function closingHour() { return CLUB_HOURS.closesAt <= CLUB_HOURS.opensAt ? CLUB_HOURS.closesAt + 24 : CLUB_HOURS.closesAt; }
  var HOURS = Array.from({ length: closingHour() - CLUB_HOURS.opensAt }, function (_, index) { return index + CLUB_HOURS.opensAt; });
  var TIME_SLOTS = Array.from({ length: (closingHour() - CLUB_HOURS.opensAt) * 4 }, function (_, index) { return CLUB_HOURS.opensAt * 60 + index * SLOT_MINUTES; });
  var TYPES = {
    pyramid: { label: 'Пирамида', short: 'Пирамида', count: 7 },
    pool: { label: 'Американский пул', short: 'Пул', count: 5 },
    snooker: { label: 'Снукер', short: 'Снукер', count: 1 }
  };
  var TABLES = [];
  Object.keys(TYPES).forEach(function (key) {
    for (var number = 1; number <= TYPES[key].count; number += 1) {
      TABLES.push({ id: key + '-' + number, type: key, number: number, label: key === 'snooker' ? 'Снукер' : TYPES[key].short + ' ' + number });
    }
  });
  // Demonstration hourly rates only. They require club-owner confirmation.
  var RATES = {
    pyramid: { daytime: 260, evening: 340, late: 300 },
    pool: { daytime: 220, evening: 290, late: 260 },
    snooker: { daytime: 300, evening: 390, late: 340 }
  };

  function pad(value) { return String(value).padStart(2, '0'); }
  function keyForDate(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function parseDate(key) { var parts = key.split('-').map(Number); return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0); }
  function plusDays(key, count) { var date = parseDate(key); date.setDate(date.getDate() + count); return keyForDate(date); }

  // Existing v1 localStorage recorded start/duration in whole hours. Keep reading it
  // while new entries use absolute minutes, so no already-created demo data is lost.
  function toStartMinutes(value) {
    var numeric = Number(value);
    return numeric <= closingHour() ? numeric * 60 : numeric;
  }
  function toDurationMinutes(value) {
    var numeric = Number(value);
    return numeric <= (closingHour() - CLUB_HOURS.opensAt) ? numeric * 60 : numeric;
  }
  function opMoment(day, start) { var date = parseDate(day); date.setHours(0, toStartMinutes(start), 0, 0); return date; }
  function displayHour(value) { return pad(Math.floor(toStartMinutes(value) / 60) % 24); }
  function displayTime(value) { var minutes = toStartMinutes(value); return pad(Math.floor(minutes / 60) % 24) + ':' + pad(minutes % 60); }
  function displayRange(start, duration) { return displayTime(start) + '–' + displayTime(toStartMinutes(start) + toDurationMinutes(duration)); }
  function displayDuration(duration) {
    var minutes = toDurationMinutes(duration);
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    return rest ? hours + ' ч ' + rest + ' мин' : hours + ' ч';
  }
  function tableById(id) { return TABLES.find(function (table) { return table.id === id; }); }
  function periodFor(value) {
    var hour = Math.floor(toStartMinutes(value) / 60) % 24;
    return hour >= 12 && hour < 17 ? 'daytime' : hour >= 17 && hour < 22 ? 'evening' : 'late';
  }
  function maxUntilClose(start) { return Math.max(0, closingHour() * 60 - toStartMinutes(start)); }
  function validSelection(selection) {
    if (!selection || !tableById(selection.tableId)) return false;
    var start = toStartMinutes(selection.start);
    var duration = toDurationMinutes(selection.duration);
    return TIME_SLOTS.indexOf(start) >= 0 && duration >= 60 && duration % SLOT_MINUTES === 0 && duration <= maxUntilClose(start);
  }
  function isActive(booking) { return booking.status === 'confirmed'; }
  function overlaps(booking, selection) {
    if (!isActive(booking) || booking.tableId !== selection.tableId || booking.day !== selection.day) return false;
    var bookingStart = toStartMinutes(booking.start);
    var bookingDuration = toDurationMinutes(booking.duration);
    var start = toStartMinutes(selection.start);
    var duration = toDurationMinutes(selection.duration);
    return bookingStart < start + duration && start < bookingStart + bookingDuration;
  }
  function isAvailable(bookings, selection) { return validSelection(selection) && !bookings.some(function (booking) { return overlaps(booking, selection); }); }
  function maxFreeDuration(bookings, selection) {
    if (!selection || !selection.tableId || !selection.day || TIME_SLOTS.indexOf(toStartMinutes(selection.start)) < 0) return 0;
    var available = 0;
    for (var duration = 60; duration <= maxUntilClose(selection.start); duration += SLOT_MINUTES) {
      if (!isAvailable(bookings, { tableId: selection.tableId, day: selection.day, start: toStartMinutes(selection.start), duration: duration })) break;
      available = duration;
    }
    return available;
  }
  function nextBooking(bookings, selection) {
    if (!selection || !selection.tableId || !selection.day) return null;
    var start = toStartMinutes(selection.start);
    return bookings.filter(function (booking) {
      return isActive(booking) && booking.tableId === selection.tableId && booking.day === selection.day && toStartMinutes(booking.start) >= start;
    }).sort(function (left, right) {
      return toStartMinutes(left.start) - toStartMinutes(right.start);
    })[0] || null;
  }
  function freeTables(bookings, details) {
    return TABLES.filter(function (table) {
      return (!details.type || table.type === details.type) && isAvailable(bookings, { tableId: table.id, day: details.day, start: details.start, duration: details.duration });
    });
  }
  function slotBooking(bookings, tableId, day, start) {
    var slotStart = toStartMinutes(start);
    var slotEnd = slotStart + 60;
    return bookings.find(function (booking) {
      var bookingStart = toStartMinutes(booking.start);
      var bookingEnd = bookingStart + toDurationMinutes(booking.duration);
      return isActive(booking) && booking.tableId === tableId && booking.day === day && bookingStart < slotEnd && slotStart < bookingEnd;
    });
  }
  function costBreakdown(selection) {
    if (!validSelection(selection)) return { total: 0, lines: [] };
    var table = tableById(selection.tableId);
    var amounts = { daytime: 0, evening: 0, late: 0 };
    var start = toStartMinutes(selection.start);
    var duration = toDurationMinutes(selection.duration);
    for (var point = start; point < start + duration; point += SLOT_MINUTES) {
      var period = periodFor(point);
      amounts[period] += RATES[table.type][period] / 4;
    }
    var lines = Object.keys(amounts).filter(function (period) { return amounts[period] > 0; }).map(function (period) { return { period: period, amount: Math.round(amounts[period] * 100) / 100 }; });
    return { total: Math.round(lines.reduce(function (sum, line) { return sum + line.amount; }, 0) * 100) / 100, lines: lines };
  }

  return { CLUB_HOURS: CLUB_HOURS, SLOT_MINUTES: SLOT_MINUTES, HOURS: HOURS, TIME_SLOTS: TIME_SLOTS, TYPES: TYPES, TABLES: TABLES, RATES: RATES, keyForDate: keyForDate, plusDays: plusDays, opMoment: opMoment, displayHour: displayHour, displayTime: displayTime, displayRange: displayRange, displayDuration: displayDuration, tableById: tableById, periodFor: periodFor, maxUntilClose: maxUntilClose, isAvailable: isAvailable, maxFreeDuration: maxFreeDuration, nextBooking: nextBooking, freeTables: freeTables, slotBooking: slotBooking, costBreakdown: costBreakdown, toStartMinutes: toStartMinutes, toDurationMinutes: toDurationMinutes };
});
