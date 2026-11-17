const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const domain = require('../domain.js');

const day = '2030-05-20';
assert.strictEqual(domain.TABLES.length, 13);
assert.deepStrictEqual(domain.TABLES.reduce((counts, table) => ({ ...counts, [table.type]: (counts[table.type] || 0) + 1 }), {}), { pyramid: 7, pool: 5, snooker: 1 });
// Existing v1 records use whole hours and must remain valid.
const bookings = [{ id: 'legacy', tableId: 'pool-1', day, start: 19, duration: 2, status: 'confirmed' }];

// 1. A 15-minute start conflicts with a retained whole-hour reservation.
assert.strictEqual(domain.isAvailable(bookings, { tableId: 'pool-1', day, start: 19 * 60 + 15, duration: 60 }), false);
assert.deepStrictEqual(domain.freeTables(bookings, { type: 'pool', day, start: 19 * 60 + 15, duration: 60 }).map(table => table.id), ['pool-2', 'pool-3', 'pool-4', 'pool-5']);

// 2. A quarter-hour schedule reaches the 23:00 close exactly.
assert.strictEqual(domain.maxUntilClose(22 * 60), 60);
assert.strictEqual(domain.maxFreeDuration(bookings, { tableId: 'pool-1', day, start: 17 * 60 }), 120);
assert.strictEqual(domain.displayRange(20 * 60 + 15, 60), '20:15–21:15');
assert.strictEqual(domain.nextBooking(bookings, { tableId: 'pool-1', day, start: 15 * 60 }).id, 'legacy');
assert.strictEqual(domain.nextBooking(bookings, { tableId: 'pool-1', day, start: 21 * 60 }), null);

// 3. Durations keep the exact 15-minute gap before a following reservation.
const laterBooking = [{ id: 'later', tableId: 'pyramid-3', day, start: 18, duration: 1, status: 'confirmed' }];
assert.strictEqual(domain.maxFreeDuration(laterBooking, { tableId: 'pyramid-3', day, start: 16 * 60 + 30 }), 90);
assert.deepStrictEqual([60, 75, 90].filter(duration => domain.isAvailable(laterBooking, { tableId: 'pyramid-3', day, start: 16 * 60 + 30, duration })), [60, 75, 90]);
assert.deepStrictEqual([16 * 60, 16 * 60 + 15, 16 * 60 + 30, 16 * 60 + 45, 17 * 60].filter(start => domain.isAvailable(laterBooking, { tableId: 'pyramid-3', day, start, duration: 60 })), [16 * 60, 16 * 60 + 15, 16 * 60 + 30, 16 * 60 + 45, 17 * 60]);
const laterQuarterBooking = [{ id: 'later-quarter', tableId: 'pyramid-3', day, start: 18 * 60 + 15, duration: 1, status: 'confirmed' }];
assert.strictEqual(domain.maxFreeDuration(laterQuarterBooking, { tableId: 'pyramid-3', day, start: 16 * 60 + 30 }), 105);
assert.deepStrictEqual([60, 75, 90, 105].filter(duration => domain.isAvailable(laterQuarterBooking, { tableId: 'pyramid-3', day, start: 16 * 60 + 30, duration })), [60, 75, 90, 105]);
assert.strictEqual(domain.maxFreeDuration([], { tableId: 'pyramid-3', day, start: 21 * 60 + 30 }), 90);

// 4. The hour overview may be green, but only starts that fit a full hour are offered.
const nextHourBooking = [{ id: 'next-hour', tableId: 'pyramid-3', day, start: 14, duration: 1, status: 'confirmed' }];
const startsAt13 = [0, 15, 30, 45].map(minute => 13 * 60 + minute).filter(start => domain.isAvailable(nextHourBooking, { tableId: 'pyramid-3', day, start, duration: 60 }));
assert.deepStrictEqual(startsAt13, [13 * 60]);
const startsAt22 = [0, 15, 30, 45].map(minute => 22 * 60 + minute).filter(start => domain.isAvailable([], { tableId: 'pyramid-3', day, start, duration: 60 }));
assert.deepStrictEqual(startsAt22, [22 * 60]);

// 4a. An hourly admin cell is busy whenever any part of its hour intersects a booking.
const partialHour = [{ id: 'partial-hour', tableId: 'pyramid-1', day, start: 12 * 60 + 15, duration: 60, status: 'confirmed' }];
assert(domain.slotBooking(partialHour, 'pyramid-1', day, 12));
assert(domain.slotBooking(partialHour, 'pyramid-1', day, 13));
assert.strictEqual(domain.slotBooking(partialHour, 'pyramid-1', day, 14), undefined);

// 5. Tariffs change correctly inside a booking that crosses 22:00.
assert.strictEqual(domain.costBreakdown({ tableId: 'pool-2', day, start: 20 * 60, duration: 180 }).total, 840);
assert.strictEqual(domain.costBreakdown({ tableId: 'pool-2', day, start: 21 * 60 + 45, duration: 60 }).total, 267.5);

bookings[0].status = 'cancelled';
assert.strictEqual(domain.isAvailable(bookings, { tableId: 'pool-1', day, start: 19 * 60 + 15, duration: 60 }), true);
assert.strictEqual(domain.nextBooking(bookings, { tableId: 'pool-1', day, start: 15 * 60 }), null);

// Closing at 02:00 remains a configuration change and correctly crosses midnight.
const overnightModule = { exports: {} };
const source = fs.readFileSync(require.resolve('../domain.js'), 'utf8').replace('closesAt: 23', 'closesAt: 2');
vm.runInNewContext(source, { module: overnightModule, exports: overnightModule.exports, globalThis: {} });
const overnight = overnightModule.exports;
assert.strictEqual(overnight.TIME_SLOTS.at(-1), 25 * 60 + 45);
assert.strictEqual(overnight.maxUntilClose(22 * 60), 240);
assert.strictEqual(overnight.displayRange(23 * 60, 180), '23:00–02:00');

console.log('Client First pilot passed: 15-minute conflicts, availability, tariff boundary, cancellation and configurable closing time.');
