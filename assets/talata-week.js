/* This week at Talata (Website v3, 2 Oct 2026).
 *
 * The page ships the whole weekly timetable as plain HTML plus the same rows as
 * JSON (#tw-week, written by tools/apply-facts.py from data/facts.json). This
 * redraws it as seven days starting today, in Copenhagen time: real dates, rows
 * that have not started yet or have ended left out, days off (Off column) left
 * out, and games added. Without JS the weekly timetable stays, which is still
 * right.
 *
 * GAMES (6 Oct 2026). On pages that load talata-fixtures.js (index, men,
 * academy) the games come from window.TalataGames: the same merged, deduped,
 * clock-aware list the ticker uses, which carries Holdsport-only games too.
 * This file loads first, so it reads the list if it is already there and
 * listens for 'talata:games' if not. /data/fixtures.json stays as the
 * fallback, and is ignored once the live list has drawn. Each game is a navy
 * card that links to /games#g-<id>.
 *
 * A team page carries only its own rows, and data-games="U13,U15" on the grid
 * keeps only that team's games (empty: none). No data-games: every game.
 *
 * ?today=2026-10-03 (or ?now=2026-10-09T20:30) overrides the date on
 * localhost only, for checking.
 */
(function () {
  'use strict';
  var grid = document.querySelector('[data-talata-week]');
  var data = document.getElementById('tw-week');
  if (!grid || !data) return;
  var rows;
  try { rows = JSON.parse(data.textContent); } catch (e) { return; }
  var only = grid.hasAttribute('data-games')
    ? grid.getAttribute('data-games').split(',').filter(Boolean) : null;

  var DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* The federation file says U9, Holdsport says Mini. The data-games
     attributes are rewritten nightly by apply-facts.py, so the alias lives
     here. */
  var ALIAS = { Mini: 'U9', Junior: 'U11' };

  function todayCph() {
    var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    var q = local && new URLSearchParams(location.search).get('today');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    var n = local && new URLSearchParams(location.search).get('now');
    if (n && /^\d{4}-\d{2}-\d{2}T/.test(n)) return n.slice(0, 10);
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

  /* One game, one card. The whole card is the link, so the ticket is a pill
     inside it and never a nested button; the claim lives on /games#g-<id>.
     Crests and the ticket rule come from talata-fixtures.js (TalataFx). The
     pages without it (mini, sparks) get the same card in text. */
  function gameCard(g, team) {
    var opp = fx ? fx.oppLabel(g) : (g.opponent || 'Opponent to confirm');
    var night = fx && fx.isTalataNight(g);
    var free = fx && fx.canClaim(g);
    return '<li class="game"><a class="wk-game" href="/games#g-' + encodeURIComponent(String(g.id)) +
        '" data-track="week-game">' +
      '<span class="wk-game-top"><i class="wk-chip">Game</i><b class="num">' + esc(g.time || 'Time to confirm') + '</b></span>' +
      (fx ? '<span class="wk-crests">' + fx.talataCrest(g.team) + fx.crestHTML(opp) + '</span>' : '') +
      '<span class="wk-game-h">' + esc(team) + (g.home ? ' vs ' : ' at ') + esc(opp) + '</span>' +
      '<span class="wk-game-hall">' + esc(g.venue || 'Hall to confirm') + '</span>' +
      (night || free
        ? '<span class="wk-tags">' + (night ? '<i class="wk-tag">Talata Night</i>' : '') +
            (free ? '<i class="wk-tag is-free">Free ticket</i>' : '') + '</span>'
        : '') +
    '</a></li>';
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
      var hasGame = false;
      (games || []).forEach(function (g) {
        if (g.date !== iso) return;
        if (fx ? fx.isOver(g) : (g.played || g.date < today)) return;
        if (g.annulled) return;
        var team = ALIAS[g.team] || g.team;
        if (only && only.indexOf(team) === -1) return;
        hasGame = true;
        items.push({ t: g.time || '99:99', html: gameCard(g, team) });
      });
      items.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
      html += '<div class="wk-day' + (i === 0 ? ' today' : '') + (hasGame ? ' has-game' : '') + '"><h3>' + esc(label) + '</h3>' +
        (items.length ? '<ul>' + items.map(function (x) { return x.html; }).join('') + '</ul>'
                      : '<p class="wk-none">No training</p>') + '</div>';
    }
    grid.innerHTML = html;
  }

  var fx = null, live = false;
  function drawLive() {
    if (!window.TalataGames) return;
    live = true;
    fx = window.TalataFx || null;
    draw(window.TalataGames);
  }
  document.addEventListener('talata:games', drawLive);

  if (window.TalataGames) drawLive();
  else draw([]);
  fetch('/data/fixtures.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.games && !live) draw(d.games); })
    .catch(function () { /* the training days stay drawn */ });
})();
