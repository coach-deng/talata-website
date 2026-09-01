/* ==========================================================================
   Talata fixtures — feature game, month-split fixture rows, ticker, tickets.
   Paired with assets/talata-fixtures.css.

   TWO SOURCES, ON PURPOSE
   -----------------------
     /data/fixtures.json   League and cup games, from the DBBF/MVP export via
                           tools/build-fixtures.py. The federation record.
     talata-api /fixtures  Friendlies and tournaments, live from Holdsport.

   Where a game exists in both, DBBF WINS. On 26 Aug 2026 Holdsport had the
   Men's Cup game on Fri 4 Sep while DBBF had no agreed date at all, and U19 vs
   Vaerloese on Thu 10 Sep against DBBF's Fri 18 Sep. Deng's call that day:
   publish the federation record. Holdsport events carry the DBBF number in
   their title, so `dbbfId` is what the dedupe keys on.

   The static file renders on its own first. If the Worker is slow or down, the
   full league season is still on the page.

   MOUNT POINTS
     <div data-talata-ticker></div>
     <div data-talata-feature></div>
     <div data-tf-host> [data-tf-tabs] [data-tf-filters] [data-talata-fixtures] </div>
     <div data-talata-fixtures data-limit="5"></div>
   ========================================================================== */
(function () {
  'use strict';

  var API = 'https://talata-api.coach-258.workers.dev';
  var STATIC = '/data/fixtures.json';
  var CRESTS = '/data/crests.json';

  /* Tournament results, entered by hand.
     There is no automatic path for one. League and cup come from the DBBF export,
     which carries scores. Friendlies and tournaments come live from Holdsport,
     which has NO score field at all, so a tournament result can reach this page
     only through this file. It is kept out of fixtures.json because
     build-fixtures.py rewrites that file from the CSV on every run and would
     drop these on the next export. */
  var TOURN = '/data/tournaments.json';

  var crests = { names: {}, files: {} };
  var allGames = [];

  /* ---------- dates ---------- */

  /* Copenhagen "today", not the visitor's. Someone opening this from Toronto
     must not see tonight's game drop off a day early. */
  function todayISO() {
    var p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    var g = function (t) { return (p.find(function (x) { return x.type === t; }) || {}).value; };
    return g('year') + '-' + g('month') + '-' + g('day');
  }

  function parseISO(d) { var a = d.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }

  /* Whole days from Copenhagen-today to a fixture. Used to keep the feature
     game inside a window a supporter can act on. */
  function daysAway(g) {
    return Math.round((parseISO(g.date) - parseISO(todayISO())) / 86400000);
  }

  var DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  function dayName(d) { return DAYS[parseISO(d).getDay()]; }
  function longDate(d) { var x = parseISO(d); return MONTHS[x.getMonth()] + ' ' + x.getDate(); }
  function monthKey(d) { return d.slice(0, 7); }
  function monthLabel(k) {
    var a = k.split('-');
    return MONTHS[+a[1] - 1] + ', <b>' + a[0] + '</b>';
  }

  /* Tip-off as a real instant, so a countdown means the same thing everywhere.
     Copenhagen is +02:00 until the last Sunday in October, +01:00 after. */
  function tipOff(g) {
    if (!g.time) return null;
    var off = (g.date >= '2026-10-25' && g.date < '2027-03-28') ? '+01:00' : '+02:00';
    var t = Date.parse(g.date + 'T' + g.time + ':00' + off);
    return isNaN(t) ? null : t;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 'Mangler Tid' means missing TIME, not missing date. Saying TBC against a
     real date is honest; inventing a tip-off is not. */
  function timeLabel(g) {
    if (g.state === 'moving') return 'BEING MOVED';
    if (g.time) return dayName(g.date) + ', ' + g.time;
    return dayName(g.date) + ', TIME TBC';
  }

  function venueLabel(g) {
    if (!g.venue) return 'Venue to confirm';
    return g.venue + (g.court && g.court !== 'Hallen' ? ' · ' + g.court : '');
  }


  /* The fixture list needs short team labels to stay scannable. A ticket needs
     the real name of the squad. Deng, 26 Aug 2026. */
  var TEAM_FULL = {
    Men: 'Talata Men', U19: 'Talata Academy U19', U18: 'Talata Academy U19',
    U17: 'Talata Academy U17', U15: 'Talata Academy U15', U14: 'Talata Academy U15',
    U13: 'Talata Academy U13', U11: 'Talata Junior', Junior: 'Talata Junior',
    Mini: 'Talata Mini', Sparks: 'Talata Sparks'
  };
  function teamFull(t) { return TEAM_FULL[t] || ('Talata ' + (t || '')).trim(); }

  function isTalataNight(g) {
    return g.home && g.venue && g.venue.indexOf('Nørre Fælled') === 0;
  }

  /* ---------- crests ---------- */

  /* Real club crests, taken from each club's own public site (policy set by
     Deng, 26 Aug 2026). NSBU has no website at all, so it falls back to a
     monogram — which is why a manifest is consulted instead of a filename
     being guessed at. */
  var crestIndex = null;
  function crestFor(name) {
    /* Case- and accent-insensitive, because the two sources spell the same club
       differently: DBBF exports "BK Amager", Holdsport writes "Bk Amager", and
       an exact-match lookup silently drops the crest for one of them. */
    if (!crestIndex) {
      crestIndex = {};
      Object.keys(crests.names || {}).forEach(function (k) {
        crestIndex[k.toLowerCase()] = crests.names[k];
      });
    }
    var base = String(name || '').replace(/\s+\d+$/, '').trim().toLowerCase();
    var slug = crestIndex[base];
    if (!slug) {
      /* "Falcon 3" already lost its number above; this catches "Hørsholm 79ers"
         style suffixes by matching on the leading words instead. */
      var keys = Object.keys(crestIndex);
      for (var i = 0; i < keys.length; i++) {
        if (base.indexOf(keys[i]) === 0 || keys[i].indexOf(base) === 0) { slug = crestIndex[keys[i]]; break; }
      }
    }
    return slug && crests.files[slug] ? crests.files[slug] : null;
  }

  function monogram(name) {
    if (!name) return '?';
    var w = String(name)
      .replace(/\b(\d+|[IVX]+)\b/g, '')
      .replace(/\b(BK|BBK|IF|IK|Basketball|Basket|Klub|Club|Div|Academy)\b/gi, '')
      .trim().split(/[\s-]+/).filter(Boolean);
    if (!w.length) return String(name).slice(0, 2).toUpperCase();
    if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    return (w[0][0] + w[1][0]).toUpperCase();
  }

  /* The real club lockups, not the favicon mark. Deng, 26 Aug 2026. Both are
     white on transparency, which is exactly right on the dark site.
       club     TALATA / BASKETBALL   -> Men and anything non-Academy
       academy  TALATA / ACADEMY      -> U13 U15 U17 U19, the Academy brackets
     They are WORDMARKS, so the Talata slot is wider than an opponent crest
     rather than being squeezed into the same square. */
  var TALATA_CLUB = '/images/brand/talata-club-white.png';
  var TALATA_ACAD = '/images/brand/talata-academy-white.png';
  var ACADEMY_TEAMS = ['U13', 'U14', 'U15', 'U17', 'U18', 'U19'];

  function talataLogo(team) {
    return ACADEMY_TEAMS.indexOf(team) >= 0 ? TALATA_ACAD : TALATA_CLUB;
  }

  function crestHTML(name) {
    var src = crestFor(name);
    if (src) {
      return '<span class="tf-crest"><img src="' + esc(src) + '" alt="" loading="lazy"' +
        ' onerror="this.parentNode.textContent=this.parentNode.dataset.m;' +
        'this.parentNode.classList.add(\'is-mono\')" ></span>'
        .replace('<span class="tf-crest">', '<span class="tf-crest" data-m="' + esc(monogram(name)) + '">');
    }
    return '<span class="tf-crest is-mono">' + esc(monogram(name)) + '</span>';
  }

  function talataCrest(team) {
    return '<span class="tf-crest is-talata"><img src="' + talataLogo(team) +
      '" alt="Talata" loading="lazy"></span>';
  }

  /* The squad, named the way the match ticket names it (Deng, 31 Aug 2026).
     "U19" tells a parent nothing about whose child is playing; "Talata Academy
     U19" does. Same wording as sendTicketConfirmation so the strip, the ticket
     and the calendar all say one thing. */
  function squadName(team) {
    if (!team) return 'Talata';
    if (team === 'Men') return 'Talata Men';
    if (ACADEMY_TEAMS.indexOf(team) >= 0) return 'Talata Academy ' + team;
    return 'Talata ' + team;
  }

  /* A cup tie is the one fixture worth interrupting somebody for. Deng, 31 Aug:
     highlight the cup, not tournaments. compKind already separates them. */
  function isCup(g) { return compKind(g) === 'cup'; }

  /* ---------- merge ---------- */

  function merge(staticGames, liveGames) {
    var known = {};
    staticGames.forEach(function (g) { known[g.id] = true; });
    var live = (liveGames || []).filter(function (g) {
      return !(g.dbbfId && known[g.dbbfId]);   /* the federation copy wins */
    });
    return staticGames.concat(live).sort(function (a, b) {
      return (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));
    });
  }

  function upcoming(games) {
    var t = todayISO();
    return games.filter(function (g) { return g.date >= t && !g.played; });
  }
  function results(games) {
    return games.filter(function (g) { return g.played; }).reverse();
  }


  /* The key is built from the season actually loaded, so it never advertises a
     Spain colour in a year with no Spain trip. League is listed last and named
     plainly, because it is the thing every other colour is defined against. */
  var KIND_LABEL = { cup:'Cup', inv:'Tournament', se:'Sweden', es:'Spain', fr:'Friendly', lg:'League' };
  function renderKey(el, games) {
    var seen = {};
    games.forEach(function (g) { seen[compKind(g)] = true; });
    var order = ['cup', 'inv', 'se', 'es', 'fr', 'lg'].filter(function (k) { return seen[k]; });
    if (order.length < 2) { el.innerHTML = ''; return; }
    el.innerHTML = order.map(function (k) {
      return '<span class="k-' + k + '"><i></i>' + KIND_LABEL[k] + '</span>';
    }).join('');
  }

  /* ---------- feature (next game) ---------- */

  /* The detail panel. One markup for the feature game at the top of the page
     and for the panel a fixture row opens, so a game looks the same wherever
     you meet it. Modelled on zalgiris.lt (Deng, 26 Aug). */
  function detailHTML(g) {
    var opp = g.opponent || g.title;
    var t = tipOff(g);
    var row = function (k, v) {
      return '<div class="tf-row"><span>' + k + '</span><b>' + v + '</b></div>';
    };
    return '<div class="tf-feat tf-k-' + compKind(g) + '">' +
        '<div class="tf-feat-main">' +
          '<div class="tf-feat-side">' + talataCrest(g.team) + '<span>Talata</span></div>' +
          '<div class="tf-feat-mid">' +
            '<p class="tf-feat-date">' + esc(longDate(g.date).toUpperCase()) + '</p>' +
            '<p class="tf-feat-time">' + esc(g.time || 'TBC') + '</p>' +
            '<span class="tf-feat-badge">' + esc(g.team) + '</span>' +
          '</div>' +
          '<div class="tf-feat-side">' + crestHTML(opp) + '<span>' + esc(opp) + '</span></div>' +
        '</div>' +
        '<div class="tf-feat-info">' +
          row('Competition', esc(g.competition)) +
          row('Venue', esc(venueLabel(g))) +
          row('Home or away', g.home
            ? (isTalataNight(g) ? '<b class="tf-hl">Talata Night</b>' : 'Home')
            : 'Away') +
          (g.played
            ? row('Result', esc(String(g.us)) + ' - ' + esc(String(g.them)))
            : (t ? '<div class="tf-row"><span>Time left</span>' +
                   '<div class="tf-cd" data-tf-cd="' + t + '"></div></div>'
                 : row('Tip-off', g.state === 'moving'
                     ? 'Being moved, date can change'
                     : 'The federation has not set one yet'))) +
          '<div class="tf-feat-cta">' +
            (g.home && !g.played
              ? '<button class="tf-btn is-primary" data-tf-claim="' + esc(g.id) +
                '" data-tf-date="' + esc(g.date) + '">Claim free ticket</button>'
              : '') +
            '<a class="tf-btn" href="#season">All games</a>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* How much an upcoming game wants a crowd. Lower is more important.
     Deng, 27 Aug: "the cup game I would like up there, because we really want
     everybody to show up. Those kind of important ones." So the feature stops
     being "the next home game" and becomes "the home game most worth turning
     up to", inside a window near enough that it is still actionable. */
  function featureRank(g) {
    if (/pokal|cup/i.test(g.competition || '')) return 0;   /* knockout, one shot */
    if (isTalataNight(g)) return 1;                          /* our own Friday night */
    if (g.team === 'Men') return 2;
    return 3;
  }

  function renderFeature(el, games) {
    /* Lead with a game somebody can actually turn up to. The very next fixture
       may have neither an agreed time nor a venue, and two TBCs at the top of
       the page is a poor first thing to see. It still appears in the list
       below, in date order, so nothing is hidden. */
    var showable = games.filter(function (x) {
      return x.home && x.state === 'confirmed' && x.venue;
    });
    /* 60 days keeps this honest. Without a window, a cup tie in March would sit
       at the top of the page all winter while the game next Friday scrolled by
       underneath it. */
    var soon = showable.filter(function (x) { return daysAway(x) <= 60; });
    var pool = soon.length ? soon : showable;
    pool = pool.slice().sort(function (a, b) {
      var ra = featureRank(a), rb = featureRank(b);
      return ra !== rb ? ra - rb : a.date.localeCompare(b.date);
    });
    var g = pool[0]
         || games.filter(function (x) { return x.state === 'confirmed'; })[0]
         || games[0];
    if (!g) { el.innerHTML = ''; return; }
    el.innerHTML = detailHTML(g);
    startCountdowns(el);
    wireClaims(el);
  }

  /* A fixture row opens the same panel in a dialog. Zalgiris puts a DETAILS
     button on every row; here the whole row is the target, which is a bigger
     tap area on a phone and needs no extra column. */
  function openDetails(gameId) {
    var g = allGames.filter(function (x) { return String(x.id) === String(gameId); })[0];
    if (!g) return;
    var wrap = document.getElementById('tf-detail');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'tf-detail';
      document.body.appendChild(wrap);
    }
    wrap.innerHTML =
      '<div class="tf-modal" role="dialog" aria-modal="true" aria-label="Game details">' +
        '<div class="tf-detail-box">' +
          '<button class="tf-x" aria-label="Close">&times;</button>' +
          detailHTML(g) +
        '</div>' +
      '</div>';
    var close = function () { wrap.innerHTML = ''; };
    wrap.querySelector('.tf-x').addEventListener('click', close);
    wrap.querySelector('.tf-modal').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) close();
    });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });
    startCountdowns(wrap);
    wireClaims(wrap);
    wrap.querySelector('.tf-x').focus();
  }

  /* ---------- fixture rows, split by month ---------- */


  /* ---------- competition colour ----------
     Deng, 27 Aug: the league is the baseline and everything else should announce
     itself, with a trip carrying the colour of where it goes.
     Destination is read from competition + venue + title, because Holdsport puts
     the useful word in a different field depending on how the event was created.
     To add a destination, add one test here and one rule in talata-fixtures.css.
       lg  league        no bar, the baseline
       cup Danish Cup    Dannebrog red
       inv invitational  green   (BMS Herlev and other domestic stævner)
       se  Sweden        Swedish gold   (Malbas Madness, Malmö)
       es  Spain         purple         (Girona, EYBL Alicante/Tenerife)
       fr  friendly      muted slate */
  function compKind(g) {
    var hay = ((g.competition || '') + ' ' + (g.venue || '') + ' ' + (g.title || '')).toLowerCase();
    var comp = (g.competition || '').toLowerCase();
    if (/malbas|malm/.test(hay)) return 'se';
    if (/girona|spain|alicante|tenerife|eybl|barcelona/.test(hay)) return 'es';
    if (/friendly|venskab/.test(comp)) return 'fr';
    if (/herlev|bms|invitational/.test(hay)) return 'inv';
    if (/pokal|\bcup\b/.test(comp)) return 'cup';
    if (/tournament|st\u00e6vne/.test(comp)) return 'inv';
    return 'lg';
  }

  function fixtureRow(g) {
    var opp = g.opponent || g.title;
    var home = g.home;
    /* 🔴 The Talata side prints NO name (Deng, 1 Sep 2026). The club crest is
       the wordmark "TALATA ACADEMY", so printing the word "Talata" beside it
       read as "TALATA ACADEMY Talata" on every away row. The empty span stays
       so the two sides still balance on flex. The opponent keeps its name,
       because a two-letter monogram is not a name. */
    var left = home ? '' : esc(opp);
    var right = home ? esc(opp) : '';
    var leftCrest = home ? talataCrest(g.team) : crestHTML(opp);
    var rightCrest = home ? crestHTML(opp) : talataCrest(g.team);
    var sLeft = g.played ? (home ? g.us : g.them) : '–';
    var sRight = g.played ? (home ? g.them : g.us) : '–';
    var won = g.played && g.us > g.them;
    /* Mark the side that actually won, not both numbers. `.tf-r.is-won
       .tf-r-score` used to paint the pair green, so a 41-59 win showed the
       opponent's 41 in the win colour too. */
    var lWon = g.played && sLeft > sRight;
    var rWon = g.played && sRight > sLeft;

    return '<article data-tf-open="' + esc(g.id) + '" tabindex="0" role="button"' +
      ' class="tf-r tf-k-' + compKind(g) + (home ? ' is-home' : '') +
        (g.state !== 'confirmed' ? ' is-tbc' : '') +
        (g.played ? (won ? ' is-won' : ' is-lost') : '') + '">' +
      '<div class="tf-r-comp"><span>' + esc(g.competition) + '</span><b>' + esc(timeLabel(g)) + '</b></div>' +
      '<div class="tf-r-venue"><span>' + (home ? 'Home' : 'Away') + '</span><b>' + esc(venueLabel(g)) + '</b></div>' +
      '<div class="tf-r-match">' +
        '<span class="tf-r-team is-l">' + left + '</span>' + leftCrest +
        /* One scoreline, not two pills. Two boxes read as two unrelated
           numbers; a scoreline reads as a result. */
        '<span class="tf-r-score' + (g.played ? ' is-done' : '') + '">' +
          '<b' + (lWon ? ' class="is-w"' : '') + '>' + sLeft + '</b>' +
          '<i>' + (g.played ? '–' : 'v') + '</i>' +
          '<b' + (rWon ? ' class="is-w"' : '') + '>' + sRight + '</b>' +
        '</span>' +
        rightCrest + '<span class="tf-r-team is-r">' + right + '</span>' +
      '</div>' +
      '<div class="tf-r-act">' +
        (isTalataNight(g) ? '<span class="tf-r-tag">Talata Night</span>' : '') +
        (home && !g.played
          ? '<button class="tf-r-tix" data-tf-claim="' + esc(g.id) +
            '" data-tf-date="' + esc(g.date) + '">Free ticket</button>'
          : (g.played ? '' : '<span class="tf-r-free">Free entry</span>')) +
        '<span class="tf-r-more">Details &rsaquo;</span>' +
      '</div>' +
    '</article>';
  }

  /* "U19,U15" -> only those teams. Empty or missing means every team. */
  function filterTeams(games, spec) {
    if (!spec) return games;
    var want = spec.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    if (!want.length) return games;
    return games.filter(function (g) { return want.indexOf(g.team) >= 0; });
  }

  function renderRows(el, games) {
    var limit = parseInt(el.getAttribute('data-limit') || '0', 10);
    var list = limit > 0 ? games.slice(0, limit) : games;

    if (!list.length) {
      el.innerHTML = '<p class="tf-empty">Try another filter, or <a href="/games">see the full season</a>.</p>';
      return;
    }

    var order = [], byMonth = {};
    list.forEach(function (g) {
      var k = monthKey(g.date);
      if (!byMonth[k]) { byMonth[k] = []; order.push(k); }
      byMonth[k].push(g);
    });

    var html = order.map(function (k) {
      return '<section class="tf-month"><h3 class="tf-mh">' + monthLabel(k) + '</h3>' +
        byMonth[k].map(fixtureRow).join('') + '</section>';
    }).join('');

    if (limit > 0 && games.length > limit) {
      html += '<p class="tf-more"><a href="/games">See the full season</a></p>';
    }
    el.innerHTML = html;
    wireClaims(el);

    if (!el._tfRowsWired) {
      el._tfRowsWired = true;
      /* Delegated, because the list is re-rendered on every filter and tab
         change and per-row listeners would be lost each time. */
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-tf-claim]')) return;   /* the ticket button owns its click */
        var row = e.target.closest('[data-tf-open]');
        if (row) openDetails(row.getAttribute('data-tf-open'));
      });
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var row = e.target.closest('[data-tf-open]');
        if (row) { e.preventDefault(); openDetails(row.getAttribute('data-tf-open')); }
      });
    }
  }

  /* ---------- ticker ---------- */

  function renderTicker(el, games) {
    if (!games.length) { el.innerHTML = ''; return; }
    /* 🔴 `!g.played` is load-bearing. tipOff() returns a timestamp for ANY game
       carrying a time, finished ones included, so the moment the Malmö results
       went into this strip on 31 Aug the "next" id locked onto a game that had
       already been played. isNext then never matched, which silently killed the
       highlight, the countdown AND the scroll-park that centres the strip on the
       next game. It looked like a styling preference and it was a broken filter. */
    var nextId = (games.filter(function (g) {
      return !g.played && tipOff(g) !== null;
    })[0] || {}).id;

    var cards = games.slice(0, 12).map(function (g) {
      var opp = g.opponent || g.title;
      var isNext = !g.played && g.id === nextId;
      var won = g.played && g.us > g.them;
      var cup = isCup(g) && !g.played;
      return '<a class="tkc' + (g.home ? ' is-home' : '') + (isNext ? ' is-next' : '') +
        (cup ? ' is-cup' : '') +
        (g.played ? ' is-done' : '') + '" href="/games">' +
        (cup ? '<span class="tkc-cup">Cup</span>' : '') +
        (isNext && !cup ? '<span class="tkc-nx">Next up</span>' : '') +
        '<div class="tkc-crests">' + talataCrest(g.team) +
          '<span class="tkc-sep">' + (g.home ? 'vs' : 'at') + '</span>' +
          crestHTML(opp) + '</div>' +
        '<span class="tkc-opp">' + esc(opp) + '</span>' +
        '<span class="tkc-squad">' + esc(squadName(g.team)) + '</span>' +
        (g.played
          ? '<span class="tkc-score' + (won ? ' is-won' : '') + '">' +
              esc(String(g.us)) + ' <i>-</i> ' + esc(String(g.them)) + '</span>' +
            '<span class="tkc-when">ENDED</span>'
          : '<span class="tkc-date">' + esc(longDate(g.date)) + '</span>' +
            (isNext
              ? '<span class="tkc-cd tf-cd" data-tf-cd="' + tipOff(g) + '"></span>'
              : '<span class="tkc-when">' + esc(timeLabel(g)) + '</span>')) +
        (isTalataNight(g) && !g.played ? '<span class="tkc-tag">Talata Night</span>' : '') +
      '</a>';
    }).join('');

    /* No auto-scroll (Deng, 26 Aug 2026): it was a moving target you had to
       wait for. One strip, scrolled by hand or by the arrows, parked on the
       next game. Also removes the duplicated set the marquee needed, so a
       screen reader hears each fixture once with no aria-hidden clone. */
    el.innerHTML =
      '<div class="tk" role="region" aria-label="Upcoming Talata games">' +
        '<button class="tk-arw is-l" aria-label="Scroll back">&#8249;</button>' +
        '<div class="tk-viewport"><div class="tk-set">' + cards + '</div></div>' +
        '<button class="tk-arw is-r" aria-label="Scroll forward">&#8250;</button>' +
      '</div>';

    var vp = el.querySelector('.tk-viewport');
    var back = el.querySelector('.tk-arw.is-l');
    var fwd = el.querySelector('.tk-arw.is-r');

    /* Park the strip ON the next game rather than at its left edge, so results
       sit behind it and the rest of the season runs ahead of it. Zalgiris does
       this and Deng asked for the same on 27 Aug: last three results first, the
       next game in the middle. Still no animation, this is a one-off position,
       so the "nothing moves on its own" rule from 26 Aug holds. */
    var nextCard = el.querySelector('.tkc.is-next');
    if (nextCard) {
      requestAnimationFrame(function () {
        var want = nextCard.offsetLeft - (vp.clientWidth - nextCard.offsetWidth) / 2;
        vp.scrollLeft = Math.max(0, want);
      });
    }

    /* Arrows only, no dragging or wheel-scrolling (Deng, 26 Aug). The viewport
       is overflow:hidden in CSS, which still permits programmatic scrollLeft,
       so the buttons remain the only way to move the strip. They are real
       <button>s, so this stays reachable by keyboard. */
    var sync = function () {
      var max = vp.scrollWidth - vp.clientWidth - 1;
      back.disabled = vp.scrollLeft <= 0;
      fwd.disabled = vp.scrollLeft >= max;
    };
    var step = function (dir) {
      vp.scrollBy({ left: dir * Math.max(200, vp.clientWidth * 0.8), behavior: 'smooth' });
      setTimeout(sync, 420);
    };
    back.addEventListener('click', function () { step(-1); });
    fwd.addEventListener('click', function () { step(1); });

    /* Park on the next game rather than the left edge, so the first card in
       view is the fixture that actually matters. */
    var nextCard = el.querySelector('.tkc.is-next');
    if (nextCard) vp.scrollLeft = Math.max(0, nextCard.offsetLeft - 8);
    sync();
    window.addEventListener('resize', sync);

    startCountdowns(el);
  }

  /* One interval per host element. Both a card and its clone carry the
     attribute, so they stay in step. */
  function startCountdowns(host) {
    var nodes = host.querySelectorAll('[data-tf-cd]');
    if (!nodes.length) return;
    if (host._tfTimer) clearInterval(host._tfTimer);
    var tick = function () {
      var now = Date.now(), live = 0;
      Array.prototype.forEach.call(nodes, function (n) {
        var ms = parseInt(n.getAttribute('data-tf-cd'), 10) - now;
        if (ms <= 0) { n.innerHTML = '<span><b>TIP-OFF</b></span>'; return; }
        live++;
        var m = Math.floor(ms / 60000);
        n.innerHTML =
          '<span><b>' + Math.floor(m / 1440) + '</b><i>days</i></span>' +
          '<span><b>' + Math.floor((m % 1440) / 60) + '</b><i>hrs</i></span>' +
          '<span><b>' + (m % 60) + '</b><i>min</i></span>';
      });
      if (!live) { clearInterval(host._tfTimer); host._tfTimer = null; }
    };
    tick();
    host._tfTimer = setInterval(tick, 30000);
  }

  /* ---------- free tickets ---------- */

  /* Entry is free and stays free. A ticket exists so the club can answer the
     one question it never could: how many people actually came. Claiming also
     enters that person in the monthly draw, so a supporter does one thing.
     No stake is ever paid, which keeps this outside Danish gambling law. */
  function wireClaims(scope) {
    var nodes = (scope || document).querySelectorAll('[data-tf-claim]');
    Array.prototype.forEach.call(nodes, function (btn) {
      if (btn._tfWired) return;
      btn._tfWired = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openClaim(btn.getAttribute('data-tf-claim'), btn.getAttribute('data-tf-date'), btn);
      });
    });
  }

  function openClaim(gameId, date, btn) {
    var g = allGames.filter(function (x) { return String(x.id) === String(gameId); })[0] || {};
    var wrap = document.getElementById('tf-claim');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'tf-claim';
      document.body.appendChild(wrap);
    }
    wrap.innerHTML =
      '<div class="tf-modal" role="dialog" aria-modal="true" aria-label="Claim a free ticket">' +
        '<div class="tf-modal-box">' +
          '<button class="tf-x" aria-label="Close">&times;</button>' +
          '<p class="tf-k">Free ticket</p>' +
          '<h3>' + esc(g.team || 'Talata') + ' vs ' + esc(g.opponent || g.title || '') + '</h3>' +
          '<p class="tf-mwhen">' + esc(longDate(date)) + ' · ' + esc(timeLabel(g)) +
            '<br>' + esc(venueLabel(g)) + '</p>' +
          '<form>' +
            '<label>Your email<input type="email" name="email" required placeholder="you@email.dk"></label>' +
            '<label>How many of you<select name="seats">' +
              '<option>1</option><option>2</option><option selected>3</option>' +
              '<option>4</option><option>5</option><option>6</option>' +
              '<option>8</option><option>10</option>' +
            '</select></label>' +
            '<button type="submit" class="tf-btn is-primary">Claim ticket</button>' +
          '</form>' +
          '<p class="tf-fine">Entry is free. This tells us how many to expect and puts you in ' +
            'the monthly draw. Anyone can enter, and under 13s should ask a parent to use ' +
            'their email. Every mail we send has an unsubscribe link.</p>' +
          '<p class="tf-ok"></p>' +
        '</div>' +
      '</div>';

    var close = function () { wrap.innerHTML = ''; if (btn) btn.focus(); };
    wrap.querySelector('.tf-x').addEventListener('click', close);
    wrap.querySelector('.tf-modal').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) close();
    });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    var form = wrap.querySelector('form');
    var email = form.querySelector('[name=email]');
    email.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (email.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { email.focus(); return; }
      var sb = form.querySelector('button');
      sb.disabled = true; sb.textContent = 'Claiming...';
      fetch(API + '/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /* The match details travel with the claim so the confirmation email can
           name the game, the night and the hall. The Worker holds only the DBBF
           game number, and an email that says "your ticket for 40098287" is
           useless to a parent. */
        body: JSON.stringify({
          game: gameId, date: date, email: v,
          seats: form.querySelector('[name=seats]').value,
          team: teamFull(g.team),
          opponent: g.opponent || g.title || '',
          home: !!g.home,
          when: DAYS_LONG[parseISO(date).getDay()] + ' ' + longDate(date),
          time: g.time || '',
          venue: venueLabel(g),
          competition: g.competition || 'Talata Basketball',
          talataNight: isTalataNight(g)
        })
      }).then(function (r) { return r.json(); }).then(function () {
        form.style.display = 'none';
        var ok = wrap.querySelector('.tf-ok');
        ok.innerHTML = '<b>You are on the list.</b><br>See you at the game, and you are in ' +
          'this month’s draw.';
        ok.style.display = 'block';
        if (window.gtag) gtag('event', 'ticket_claim', { game: gameId });
        if (btn) { btn.textContent = 'Ticket claimed'; btn.disabled = true; }
      }).catch(function () {
        sb.disabled = false; sb.textContent = 'Try again';
      });
    });
  }

  /* ---------- tabs + filters ---------- */

  function wireHost(host) {
    var out = host.querySelector('[data-talata-fixtures]');
    var tabsEl = host.querySelector('[data-tf-tabs]');
    var barEl = host.querySelector('[data-tf-filters]');
    if (!out) return;

    /* One list, no tabs.
       Deng, 31 Aug 2026: played games and their scores belong in the season list,
       not behind a second tab. A parent looking for "how did Malmö go" should not
       have to know a Results tab exists. So the season runs in date order,
       finished games carry their score and the rest carry a dash. */
    var state = { filter: 'all' };

    var teams = [];
    allGames.forEach(function (g) { if (teams.indexOf(g.team) < 0) teams.push(g.team); });
    var order = ['Men', 'U19', 'U18', 'U17', 'U15', 'U14', 'U13', 'U11'];
    teams.sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    /* The tabs mount stays in the markup and stays empty, so a page that still
       has the div does not grow a stray gap. */
    if (tabsEl) { tabsEl.innerHTML = ''; tabsEl.hidden = true; }
    if (barEl) {
      barEl.innerHTML = ['<button class="tf-chip is-on" data-f="all">All games</button>',
        '<button class="tf-chip" data-f="home">Home</button>',
        '<button class="tf-chip" data-f="away">Away</button>']
        .concat(teams.map(function (t) {
          return '<button class="tf-chip" data-f="team:' + esc(t) + '">' + esc(t) + '</button>';
        })).join('');
    }

    function paintList() {
      /* Whole season in date order. merge() already sorted it, so a played game
         sits under its own month above the fixtures still to come. */
      var base = allGames;
      var list = base;
      if (state.filter === 'home') list = base.filter(function (g) { return g.home; });
      else if (state.filter === 'away') list = base.filter(function (g) { return !g.home; });
      else if (state.filter.indexOf('team:') === 0) {
        var t = state.filter.slice(5);
        list = base.filter(function (g) { return g.team === t; });
      }
      renderRows(out, list);
    }
    if (barEl) barEl.addEventListener('click', function (e) {
      var b = e.target.closest('.tf-chip'); if (!b) return;
      Array.prototype.forEach.call(barEl.querySelectorAll('.tf-chip'), function (x) {
        x.classList.toggle('is-on', x === b);
      });
      state.filter = b.getAttribute('data-f');
      paintList();
    });

    /* Deep link. /games?team=Men lands with that chip already on, which is what
       the Programmes menu points at: a group's page sends you to its own season
       rather than to the top of a list of forty games. */
    var want = (new URLSearchParams(location.search).get('team') || '').trim();
    if (want && barEl) {
      var chip = barEl.querySelector('[data-f="team:' + want.replace(/"/g, '') + '"]');
      if (chip) {
        Array.prototype.forEach.call(barEl.querySelectorAll('.tf-chip'), function (x) {
          x.classList.toggle('is-on', x === chip);
        });
        state.filter = 'team:' + want;
      }
    }

    host._tfPaint = paintList;
    paintList();
  }

  /* ---------- cup popup ----------
   *
   * Deng, 31 Aug 2026: "you jump on website and, hey, boom, cup game, get
   * yourself a ticket."
   *
   * 🔴 THE THING THIS HAS TO NOT DO. The homepage's job is turning a parent into
   * a free trial, and Google search is about 46% of signups. A popup that lands
   * on top of the hero competes with the one conversion the club actually lives
   * on. So it is deliberately restrained, and every one of these is a decision
   * rather than a default:
   *   - HOMEPAGE ONLY. It renders into [data-talata-cup], which exists on index
   *     and nowhere else. No mount, no popup.
   *   - DELAYED. Six seconds, so the hero and the trial CTA are read first.
   *   - ONCE PER GAME. Dismissal is stored against the game id, so closing it
   *     keeps it closed for that tie and a NEW cup game can still speak up.
   *   - CUP ONLY. Not tournaments, not Talata Night. Deng corrected himself on
   *     exactly this point.
   *   - 14 DAY WINDOW, so it cannot become wallpaper.
   * If localStorage throws (private window, blocked site data) it just shows,
   * which is the safe direction to fail.
   */
  var CUP_WINDOW_DAYS = 14;
  var CUP_DELAY_MS = 6000;
  var CUP_KEY = 'talata_cup_seen_v1';

  function cupSeen(id) {
    try { return (localStorage.getItem(CUP_KEY) || '') === String(id); } catch (e) { return false; }
  }
  function markCupSeen(id) {
    try { localStorage.setItem(CUP_KEY, String(id)); } catch (e) { /* fine */ }
  }

  function renderCupPopup(games) {
    var host = document.querySelector('[data-talata-cup]');
    if (!host) return;                          /* not the homepage */

    var t = todayISO();
    var cup = games.filter(function (g) {
      return !g.played && isCup(g) && g.date >= t && daysAway(g) <= CUP_WINDOW_DAYS;
    })[0];
    if (!cup || cupSeen(cup.id)) return;

    var when = longDate(cup.date) + (cup.time ? ', ' + cup.time : '');
    var opp = cup.opponent || cup.title || 'TBC';

    host.innerHTML =
      '<div class="cup-pop" role="dialog" aria-modal="false" aria-label="Cup game">' +
        '<button class="cup-x" aria-label="Close">&times;</button>' +
        '<p class="cup-kick">Danish Cup</p>' +
        '<p class="cup-h">' + esc(squadName(cup.team)) + ' vs ' + esc(opp) + '</p>' +
        '<p class="cup-when"><b>' + esc(when) + '</b><br>' + esc(venueLabel(cup)) + '</p>' +
        '<p class="cup-sub">Free entry, like every home game. Claim a ticket so we know how many are coming.</p>' +
        '<a class="cup-cta" href="/games#season">Claim a free ticket</a>' +
      '</div>';

    /* Mark it seen on dismiss AND on the click through, so somebody who claims
       a ticket is not asked again for the same game. */
    host.querySelector('.cup-x').addEventListener('click', function () {
      markCupSeen(cup.id); host.innerHTML = '';
    });
    host.querySelector('.cup-cta').addEventListener('click', function () {
      markCupSeen(cup.id);
    });
    requestAnimationFrame(function () {
      var box = host.querySelector('.cup-pop');
      if (box) box.classList.add('is-in');
    });
  }

  /* ---------- boot ---------- */

  function paint(games) {
    allGames = games;
    var next = upcoming(games);
    /* Last three results, then the next game, then the rest. Until the season
       starts there are no results, so this is simply the upcoming list, and it
       grows a history on its own as scoresheets are filed. */
    var strip = results(games).slice(0, 3).reverse().concat(next);
    document.querySelectorAll('[data-talata-ticker]').forEach(function (el) { renderTicker(el, strip); });
    document.querySelectorAll('[data-talata-feature]').forEach(function (el) { renderFeature(el, next); });
    document.querySelectorAll('[data-tf-key]').forEach(function (el) { renderKey(el, games); });
    document.querySelectorAll('[data-tf-host]').forEach(function (h) {
      if (h._tfPaint) h._tfPaint(); else wireHost(h);
    });
    document.querySelectorAll('[data-talata-fixtures]').forEach(function (el) {
      if (el.closest('[data-tf-host]')) return;   /* the host paints its own list */
      /* data-team="Men" or data-team="U19,U15,U13" so a programme page can show
         its own group's games. Mini, Junior and Sparks have NO fixtures at all,
         so they get no mount rather than an empty list. */
      renderRows(el, filterTeams(next, el.getAttribute('data-team')));
    });

    /* Armed once. paint() runs twice, static then live, and a second timer
       would fire a second popup over the first. */
    if (!paint._cupArmed) {
      paint._cupArmed = true;
      setTimeout(function () { renderCupPopup(allGames); }, CUP_DELAY_MS);
    }
  }

  function boot() {
    fetch(CRESTS, { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) { if (c) crests = c; })
      .catch(function () { /* monograms everywhere, still readable */ })
      .then(function () {
        return Promise.all([
          fetch(STATIC, { cache: 'no-cache' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; }),
          /* A missing or broken tournaments file must never cost the season its
             league fixtures, so it resolves to an empty list rather than reject. */
          fetch(TOURN, { cache: 'no-cache' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
        ])
          .then(function (both) {
            var d = both[0], t = both[1];
            var league = ((d && d.games) || []).concat((t && t.games) || []);
            paint(merge(league, []));       /* federation fixtures, immediately */
            return fetch(API + '/fixtures', { cache: 'no-cache' })
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (live) {
                if (live && live.games && live.games.length) paint(merge(league, live.games));
              })
              .catch(function () { /* league season already on the page */ });
          });
      })
      .catch(function () {
        document.querySelectorAll('[data-talata-fixtures]').forEach(function (el) {
          el.innerHTML = '<p class="tf-empty">Something went wrong loading the fixtures. ' +
            'Mail <a href="mailto:coach@talatabasketball.dk">coach@talatabasketball.dk</a> ' +
            'and I will send them over.</p>';
        });
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
