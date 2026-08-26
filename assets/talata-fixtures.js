/* ==========================================================================
   Talata fixtures — the ticker, the week list and the next-game block.
   Paired with assets/talata-fixtures.css. Drop-in on any page.

   TWO SOURCES, ON PURPOSE
   -----------------------
     /data/fixtures.json   League and cup games, from the DBBF/MVP export via
                           tools/build-fixtures.py. The federation record.
     talata-api /fixtures  Friendlies and tournaments, live from Holdsport.

   Where a game exists in both, DBBF WINS. On 26 Aug 2026 Holdsport had the
   Men's Cup game on Fri 4 Sep and DBBF still had no agreed date at all, and
   had U19 vs Værløse on Thu 10 Sep against DBBF's Fri 18 Sep. Deng's call
   that day: publish the federation record. Holdsport events carry the DBBF
   number in their title, so `dbbfId` is what the dedupe keys on.

   The static file loads first and renders on its own. If the Worker is slow or
   down, all 40 league fixtures are still on the page. An empty ticker on a club
   with a full season of fixtures would read as "no games this season".

   USAGE
     <div data-talata-ticker></div>
     <div data-talata-fixtures data-limit="6"></div>
     <div data-talata-fixtures data-scope="season" data-filters="true"></div>
   ========================================================================== */
(function () {
  'use strict';

  var API = 'https://talata-api.coach-258.workers.dev/fixtures';
  var STATIC = '/data/fixtures.json';

  /* Copenhagen "today", not the visitor's. Someone opening the page from
     Toronto must not see a Friday night game drop off a day early. */
  function todayISO() {
    var p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Copenhagen',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    var g = function (t) { return (p.find(function (x) { return x.type === t; }) || {}).value; };
    return g('year') + '-' + g('month') + '-' + g('day');
  }

  function parseISO(d) {
    var a = d.split('-');
    return new Date(+a[0], +a[1] - 1, +a[2]);
  }

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dayName(d) { return DAYS[parseISO(d).getDay()]; }
  function shortDate(d) {
    var x = parseISO(d);
    return DAYS[x.getDay()] + ' ' + x.getDate() + ' ' + MONTHS[x.getMonth()];
  }

  /* Monday-start week key, so "this week" means what a Dane means by it. */
  function weekStart(d) {
    var x = parseISO(d);
    var shift = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - shift);
    return x.getFullYear() + '-' +
      String(x.getMonth() + 1).padStart(2, '0') + '-' +
      String(x.getDate()).padStart(2, '0');
  }

  function weekLabel(ws, todayWs) {
    if (ws === todayWs) return 'This week';
    var a = parseISO(ws), b = parseISO(todayWs);
    var diff = Math.round((a - b) / 604800000);
    if (diff === 1) return 'Next week';
    var end = parseISO(ws); end.setDate(end.getDate() + 6);
    return 'Week of ' + a.getDate() + ' ' + MONTHS[a.getMonth()] +
      ' to ' + end.getDate() + ' ' + MONTHS[end.getMonth()];
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* A game with no agreed time still has an agreed DATE — 'Mangler Tid' means
     missing time, not missing date. Saying "TBC" against a real date is honest;
     inventing a tip-off is not. */
  function timeLabel(g) {
    if (g.state === 'moving') return 'Being moved';
    if (g.time) return g.time;
    /* A federation fixture with no time has one coming. A Holdsport entry with
       no time is a multi-day trip that never had one. Different words. */
    return g.source === 'holdsport' ? 'All day' : 'Time TBC';
  }

  /* "vs Glostrup" reads right; "at U11 Friendship game in Herlev" does not.
     Only prefix when there is an actual opponent to prefix. */
  function matchup(g) {
    if (!g.opponent) return esc(g.title || 'Talata');
    return (g.home ? 'vs ' : 'at ') + esc(g.opponent);
  }

  function venueLabel(g) {
    if (!g.venue) return g.home ? 'Home venue TBC' : 'Venue TBC';
    return g.venue + (g.court && g.court !== 'Hallen' ? ' · ' + g.court : '');
  }

  function merge(staticGames, liveGames) {
    var known = {};
    staticGames.forEach(function (g) { known[g.id] = true; });

    var live = (liveGames || []).filter(function (g) {
      /* Holdsport's copy of a league game loses to the federation's. */
      return !(g.dbbfId && known[g.dbbfId]);
    });

    var today = todayISO();
    return staticGames.concat(live)
      .filter(function (g) { return g.date >= today; })
      .sort(function (a, b) {
        return (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));
      });
  }

  /* ---------- rendering ---------- */

  function card(g) {
    var cls = 'tf-card' + (g.home ? ' is-home' : '') + (g.state !== 'confirmed' ? ' is-tbc' : '');
    var friday = g.home && g.venue && g.venue.indexOf('Nørre Fælled') === 0;
    return '<article class="' + cls + '">' +
      '<div class="tf-when"><b>' + esc(shortDate(g.date)) + '</b><span>' + esc(timeLabel(g)) + '</span></div>' +
      '<div class="tf-who">' +
        '<div class="tf-line"><span class="tf-team">' + esc(g.team) + '</span>' +
          '<span class="tf-ha">' + (g.home ? 'Home' : 'Away') + '</span>' +
          (friday ? '<span class="tf-fri">Talata Night</span>' : '') + '</div>' +
        '<h4>' + matchup(g) + '</h4>' +
        '<p class="tf-meta">' + esc(g.competition) + ' · ' + esc(venueLabel(g)) + '</p>' +
      '</div>' +
      (g.home ? '<div class="tf-cta">Free entry</div>' : '') +
      '</article>';
  }

  function renderWeeks(el, games) {
    var scope = el.getAttribute('data-scope') || 'upcoming';
    var limit = parseInt(el.getAttribute('data-limit') || '0', 10);
    var list = games.slice();
    if (limit > 0) list = list.slice(0, limit);

    if (!list.length) {
      el.innerHTML = '<p class="tf-empty">No games listed yet. ' +
        '<a href="/games.html">See the full season</a></p>';
      return;
    }

    var todayWs = weekStart(todayISO());
    var order = [], byWeek = {};
    list.forEach(function (g) {
      var ws = weekStart(g.date);
      if (!byWeek[ws]) { byWeek[ws] = []; order.push(ws); }
      byWeek[ws].push(g);
    });

    var html = order.map(function (ws) {
      return '<section class="tf-week' + (ws === todayWs ? ' is-now' : '') + '">' +
        '<h3 class="tf-wk">' + esc(weekLabel(ws, todayWs)) +
          '<span>' + byWeek[ws].length + ' game' + (byWeek[ws].length > 1 ? 's' : '') + '</span></h3>' +
        '<div class="tf-cards">' + byWeek[ws].map(card).join('') + '</div>' +
      '</section>';
    }).join('');

    if (scope !== 'season' && limit > 0 && games.length > limit) {
      html += '<p class="tf-more"><a href="/games.html">' +
        'See the full season</a></p>';
    }
    el.innerHTML = html;
  }

  function renderTicker(el, games) {
    if (!games.length) { el.innerHTML = ''; return; }

    var items = games.slice(0, 14).map(function (g) {
      var friday = g.home && g.venue && g.venue.indexOf('Nørre Fælled') === 0;
      /* The trailing space in each span is for screen readers, which run
         adjacent spans together. A CSS gap is visual only. */
      return '<a class="tk-item' + (g.home ? ' is-home' : '') + '" href="/games.html">' +
        '<span class="tk-day">' + esc(shortDate(g.date)) + ' </span>' +
        '<span class="tk-team">' + esc(g.team) + ' </span>' +
        (g.opponent ? '<span class="tk-vs">' + (g.home ? 'vs' : 'at') + ' </span>' : '') +
        '<span class="tk-opp">' + esc(g.opponent || g.title) + ' </span>' +
        '<span class="tk-time">' + esc(timeLabel(g)) + ' </span>' +
        (friday ? '<span class="tk-flag">Talata Night</span>' :
          (g.home ? '<span class="tk-flag">Home</span>' : '')) +
      '</a>';
    }).join('<span class="tk-dot" aria-hidden="true">•</span>');

    /* The track is duplicated so the CSS translate can loop seamlessly. The
       clone is aria-hidden so a screen reader reads the fixtures once. */
    el.innerHTML =
      '<div class="tk" role="region" aria-label="Upcoming Talata games">' +
        '<span class="tk-label">Next up</span>' +
        '<div class="tk-viewport">' +
          '<div class="tk-track">' +
            '<div class="tk-set">' + items + '</div>' +
            '<div class="tk-set" aria-hidden="true">' + items + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* Duration scales with content so the speed feels the same whether there
       are three games left in the season or fourteen. */
    var track = el.querySelector('.tk-track');
    var set = el.querySelector('.tk-set');
    if (track && set) {
      var secs = Math.max(24, Math.round(set.scrollWidth / 72));
      track.style.setProperty('--tk-dur', secs + 's');
    }
  }

  function renderNext(el, games) {
    var home = games.filter(function (g) { return g.home; });
    /* Lead with a home game somebody can actually turn up to. The next one on
       the list is the Cup tie, which has neither an agreed date nor a venue, so
       featuring it would put two TBCs at the top of the homepage. The full list
       below still shows it in date order, so nothing is hidden. */
    var g = home.filter(function (x) { return x.state === 'confirmed' && x.venue; })[0] ||
            home[0] || games[0];
    if (!g) { el.innerHTML = ''; return; }
    el.innerHTML =
      '<p class="tf-nx-k">' + (g.home ? 'Next home game' : 'Next game') + '</p>' +
      '<h3>' + esc(g.team) + ' ' + matchup(g) + '</h3>' +
      '<p class="tf-nx-w">' + esc(shortDate(g.date)) + ' · ' + esc(timeLabel(g)) + '</p>' +
      '<p class="tf-nx-v">' + esc(venueLabel(g)) + '</p>' +
      (g.home ? '<p class="tf-nx-free">Free to attend. Everyone welcome.</p>' : '');
  }

  /* ---------- filters (season page) ---------- */

  function wireFilters(host, games) {
    var bar = host.querySelector('[data-tf-filters]');
    var out = host.querySelector('[data-talata-fixtures]');
    if (!bar || !out) return;

    var teams = [];
    games.forEach(function (g) { if (teams.indexOf(g.team) < 0) teams.push(g.team); });
    var order = ['Men', 'U19', 'U18', 'U17', 'U15', 'U14', 'U13', 'U11'];
    teams.sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    bar.innerHTML = ['<button class="tf-chip is-on" data-f="all">All games</button>',
      '<button class="tf-chip" data-f="home">Home only</button>']
      .concat(teams.map(function (t) {
        return '<button class="tf-chip" data-f="team:' + esc(t) + '">' + esc(t) + '</button>';
      })).join('');

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.tf-chip');
      if (!btn) return;
      Array.prototype.forEach.call(bar.querySelectorAll('.tf-chip'), function (b) {
        b.classList.toggle('is-on', b === btn);
      });
      var f = btn.getAttribute('data-f');
      var list = games;
      if (f === 'home') list = games.filter(function (g) { return g.home; });
      else if (f.indexOf('team:') === 0) {
        var t = f.slice(5);
        list = games.filter(function (g) { return g.team === t; });
      }
      renderWeeks(out, list);
    });
  }

  /* ---------- boot ---------- */

  function paint(games) {
    document.querySelectorAll('[data-talata-ticker]').forEach(function (el) {
      renderTicker(el, games);
    });
    document.querySelectorAll('[data-talata-fixtures]').forEach(function (el) {
      /* Pass the FULL list. renderWeeks applies data-limit itself and needs the
         untrimmed length to decide whether an "all games" link is warranted. */
      renderWeeks(el, games);
    });
    document.querySelectorAll('[data-talata-next]').forEach(function (el) {
      renderNext(el, games);
    });
    document.querySelectorAll('[data-tf-host]').forEach(function (host) {
      wireFilters(host, games);
    });
  }

  function boot() {
    var staticGames = [];

    fetch(STATIC, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        staticGames = (d && d.games) || [];
        /* Paint the federation fixtures immediately. Friendlies join when and
           if Holdsport answers. */
        paint(merge(staticGames, []));

        return fetch(API, { cache: 'no-cache' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (live) {
            if (live && live.games && live.games.length) {
              paint(merge(staticGames, live.games));
            }
          })
          .catch(function () { /* league fixtures already on the page */ });
      })
      .catch(function () {
        document.querySelectorAll('[data-talata-fixtures]').forEach(function (el) {
          el.innerHTML = '<p class="tf-empty">Fixtures are not loading right now. ' +
            'Mail <a href="mailto:coach@talatabasketball.dk">coach@talatabasketball.dk</a>.</p>';
        });
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
