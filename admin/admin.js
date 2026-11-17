(function () {
  'use strict';
  var C = window.BilliardCityDomain;
  var STORAGE_KEY = 'billiard-city-client-first-v1';
  var LEGACY_STORAGE_KEY = 'luza-client-first-demo-v1';
  var channel = null;
  try { if ('BroadcastChannel' in window) channel = new BroadcastChannel('billiard-city-client-first-updates'); } catch (error) { channel = null; }
  var selectedDay = C.keyForDate(new Date());

  function readState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return { bookings: [], profile: { name: '', phone: '' } };
      var state = JSON.parse(raw);
      return state && Array.isArray(state.bookings) ? state : { bookings: [], profile: { name: '', phone: '' } };
    } catch (error) { return { bookings: [], profile: { name: '', phone: '' } }; }
  }
  function money(value) { return new Intl.NumberFormat('ru-RU').format(value) + ' ₴'; }
  function humanDate(day) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' }).format(new Date(day + 'T12:00:00')); }
  function maskPhone(phone) { return phone ? phone.slice(0, 4) + '•••' + phone.slice(-2) : 'демо-гость'; }
  function active(bookings) { return bookings.filter(function (booking) { return booking.status === 'confirmed'; }); }

  function render() {
    var state = readState();
    var bookings = active(state.bookings);
    var dayBookings = bookings.filter(function (booking) { return booking.day === selectedDay; });
    var busyTables = new Set(dayBookings.map(function (booking) { return booking.tableId; }));
    document.getElementById('admin-day').value = selectedDay;
    document.getElementById('admin-stats').innerHTML =
      '<article><span>Дата</span><strong>' + humanDate(selectedDay) + '</strong></article>' +
      '<article><span>Есть записи</span><strong>' + dayBookings.length + '</strong></article>' +
      '<article><span>Столы с занятыми слотами</span><strong>' + busyTables.size + ' / ' + C.TABLES.length + '</strong></article>' +
      '<article><span>Рабочий день</span><strong>' + C.displayHour(C.CLUB_HOURS.opensAt) + ':00–' + C.displayHour(C.CLUB_HOURS.closesAt) + ':00</strong></article>';
    renderSchedule(dayBookings);
    renderFuture(bookings);
    renderFood(bookings);
  }

  function renderSchedule(bookings) {
    var header = C.HOURS.map(function (hour) { return '<th>' + C.displayHour(hour) + '</th>'; }).join('');
    var rows = C.TABLES.map(function (table) {
      var cells = C.HOURS.map(function (hour) {
        var booking = C.slotBooking(bookings, table.id, selectedDay, hour);
        return '<td><span class="status ' + (booking ? 'busy' : 'free') + '" title="' + (booking ? 'Занят: ' + maskPhone(booking.phone) : 'Свободен') + '">' + (booking ? 'занят' : 'свободен') + '</span></td>';
      }).join('');
      return '<tr><th><span>' + C.TYPES[table.type].short + '</span><strong>' + table.label + '</strong></th>' + cells + '</tr>';
    }).join('');
    var details = bookings.slice().sort(function (a, b) { return C.toStartMinutes(a.start) - C.toStartMinutes(b.start); }).map(function (booking) {
      var table = C.tableById(booking.tableId);
      return '<li><strong>' + table.label + '</strong><span>Начало ' + C.displayTime(booking.start) + ' · ' + C.displayDuration(booking.duration) + ' · окончание ' + C.displayTime(C.toStartMinutes(booking.start) + C.toDurationMinutes(booking.duration)) + '</span></li>';
    }).join('');
    document.getElementById('admin-schedule').innerHTML = '<div class="schedule-wrap"><table><thead><tr><th>Стол / час</th>' + header + '</tr></thead><tbody>' + rows + '</tbody></table></div><p class="schedule-key"><i class="free"></i> свободно <i class="busy"></i> занято · только просмотр</p><section class="schedule-details"><h3>Точное время бронирований</h3>' + (details ? '<ul>' + details + '</ul>' : '<p>На эту дату подтверждённых броней нет.</p>') + '</section>';
  }

  function renderFuture(bookings) {
    var future = bookings.filter(function (booking) { return C.opMoment(booking.day, booking.start) >= new Date(); }).sort(function (a, b) { return (a.day + a.start).localeCompare(b.day + b.start); });
    var container = document.getElementById('future-bookings');
    container.innerHTML = future.length ? future.map(function (booking) {
      var table = C.tableById(booking.tableId);
      return '<article><p>' + humanDate(booking.day) + ' · ' + C.displayRange(booking.start, booking.duration) + '</p><strong>' + table.label + '</strong><span>' + maskPhone(booking.phone) + '</span></article>';
    }).join('') : '<p class="empty">Записей на будущие даты пока нет.</p>';
  }

  function renderFood(bookings) {
    var food = bookings.filter(function (booking) { return Array.isArray(booking.food) && booking.food.length; });
    document.getElementById('food-list').innerHTML = food.length ? '<p>В будущем здесь будут добровольные предзаказы: ' + food.length + '.</p>' : '<p>Нет данных — клиентский прототип не принимает заказ еды, платежи и правила доставки не имитируются.</p>';
  }

  document.getElementById('admin-day').addEventListener('change', function (event) {
    if (event.target.value) { selectedDay = event.target.value; render(); }
  });
  window.addEventListener('storage', function (event) { if (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY) render(); });
  if (channel) channel.addEventListener('message', render);
  render();
})();
