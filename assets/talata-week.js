/* This week at Talata (Website v3, 2 Oct 2026).
 *
 * The page ships the whole weekly timetable as plain HTML plus the same rows as
 * JSON (#tw-week, written by tools/apply-facts.py from data/facts.json). This
 * redraws it as seven days starting today, in Copenhagen time: real dates, rows
 * that have not started yet or have ended left out, days off (Off column) left
 * out, and games from /data/fixtures.json added. Without JS the weekly timetable
 * stays, which is still right.
 *
 * ?today=2026-10-03 overrides the date on localhost only, for checking.
 */
(function () {
  'use strict';
  var grid = document.querySelector('[data-talata-week]');
  var data = document.getElementById('tw-week');
  if (!grid || !data) return;
  var rows;
  try { rows = JSON.parse(data.textContent); } catch (e) { return; }

  var DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function todayCph() {
    var q = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('today');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }
  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function draw(games) {
    var today = todayCph();
    var html = '';
    for (var i = 0; i < 7; i++) {
      var iso = addDays(today, i);
      var d = new Date(iso + 'T12:00:00Z');
      var wd = (d.getUTCDay() + 6) % 7; // 0 = Monday, like the rows
      var label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY[wd] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()];
      var items = rows.filter(function (r) {
        return r.day === wd && (!r.starts || r.starts <= iso) && (!r.ends || iso <= r.ends) &&
          (r.off || []).indexOf(iso) === -1;
      }).map(function (r) {
        return { t: r.start, html: '<li><b class="num">' + esc(r.start) + ' to ' + esc(r.end) + '</b>' + esc(r.who) +
          '<span>' + esc(r.hall) + '</span></li>' };
      });
      (games || []).forEach(function (g) {
        if (g.date !== iso || g.played) return;
        var vs = g.home ? 'vs ' : 'at ';
        items.push({ t: g.time || '99:99', html: '<li class="game"><b class="num">' + esc(g.time || 'Time tbc') +
          ' game</b>' + esc(g.team) + ' ' + vs + esc(g.opponent) + '<span>' + esc(g.venue || '') + '</span></li>' });
      });
      items.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
      html += '<div class="wk-day' + (i === 0 ? ' today' : '') + '"><h3>' + esc(label) + '</h3>' +
        (items.length ? '<ul>' + items.map(function (x) { return x.html; }).join('') + '</ul>'
                      : '<p class="wk-none">No training</p>') + '</div>';
    }
    grid.innerHTML = html;
  }

  draw([]);
  fetch('/data/fixtures.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.games) draw(d.games); })
    .catch(function () { /* the training days stay drawn */ });
})();
