/* ==========================================================================
   Talata fixtures. Feature game, month-split fixture rows, ticker, tickets.
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
     <div data-talata-next></div>      homepage: next home game banner
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

  /* Game posters, keyed by DBBF game id. Same reason as tournaments.json: a
     hand-kept file that build-fixtures.py never rewrites. Fetched beside the
     fixtures and resolved to null on any failure, so a missing or broken
     posters file can never cost the page its season. */
  var POSTERS = '/data/posters.json';
  /* Hand-typed results and the Men's box scores, keyed by DBBF game id.
     Same terms as posters: null on any failure, nothing else changes. */
  var RESULTS = '/data/results.json';

  var crests = { names: {}, files: {} };
  var allGames = [];
  var posters = {};
  var stats = {};

  /* ---------- dates ---------- */

  /* Copenhagen "today", not the visitor's. Someone opening this from Toronto
     must not see tonight's game drop off a day early. */
  /* A test clock, localhost only (6 Oct 2026), same rule as talata-week.js.
       ?today=2026-10-06          the Copenhagen date
       ?now=2026-10-09T20:30      a Copenhagen wall-clock instant (sets today too)
     Production ignores both, so a shared link can never move the clock. */
  function testParam(k) {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null;
    try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; }
  }

  function todayISO() {
    var q = testParam('today');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    var n = testParam('now');
    if (n && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(n)) return n.slice(0, 10);
    var p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    var g = function (t) { return (p.find(function (x) { return x.type === t; }) || {}).value; };
    return g('year') + '-' + g('month') + '-' + g('day');
  }

  /* The instant every countdown and "is it over" check reads. */
  function nowMs() {
    var n = testParam('now');
    if (n && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(n)) {
      var t = Date.parse(n + ':00' + cphOff(n.slice(0, 10)));
      if (!isNaN(t)) return t;
    }
    return Date.now();
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

  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
    'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dayName(d) { return DAYS[parseISO(d).getDay()]; }
  /* DAY FIRST (Deng, 11 Sep 2026). "18 September", not "September 18".
     Two reasons. The families are Danish and read 18. september, and the
     Worker's ticket email already documents this field as day-first:
     talata-email.ts:882 annotates it "Friday 18 September" while the page was
     sending "Friday September 18" into a subject line a parent reads. The
     hand-written dates in the page copy were day-first all along, so the site
     was running two orders against each other. */
  function longDate(d) { var x = parseISO(d); return x.getDate() + ' ' + MONTHS[x.getMonth()]; }
  /* 'SEP 18' rather than 'September 18', because this one sits in the narrowest
     column of the fixture row next to the tip-off. Month first to match
     longDate, so /games never shows two date orders on one screen. */
  function shortDate(d) { var x = parseISO(d); return x.getDate() + ' ' + MONTHS_SHORT[x.getMonth()]; }
  function monthKey(d) { return d.slice(0, 7); }
  function monthLabel(k) {
    var a = k.split('-');
    return MONTHS[+a[1] - 1] + ', <b>' + a[0] + '</b>';
  }

  /* Copenhagen's UTC offset on a date. EU rule: summer time runs from the last
     Sunday in March to the last Sunday in October. Worked out per year, so the
     clock changes need no hand edit (was hard-coded to 2026-10-25 and
     2027-03-28 until 6 Oct 2026). Games never tip off in the 02:00 to 03:00
     changeover hour, so the date alone decides. */
  function lastSunday(y, m) {            /* m is 0-based */
    var d = new Date(Date.UTC(y, m + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().slice(0, 10);
  }
  function cphOff(date) {
    var y = +date.slice(0, 4);
    return (date >= lastSunday(y, 2) && date < lastSunday(y, 9)) ? '+02:00' : '+01:00';
  }

  /* Tip-off as a real instant, so a countdown means the same thing everywhere. */
  function tipOff(g) {
    if (!g.time) return null;
    var t = Date.parse(g.date + 'T' + g.time + ':00' + cphOff(g.date));
    return isNaN(t) ? null : t;
  }

  /* ---------- is the game still ahead of us (6 Oct 2026) ----------
     /games offered free tickets on the 3 and 4 Oct Grand Prix rows after they
     were played, because the export had no score yet and !played was the only
     test. A game is over once it has a score, once its date is past, or two
     and a half hours after tip-off on the day. */
  var GAME_MS = 150 * 60000;
  function isOver(g) {
    if (g.played) return true;
    var t = todayISO();
    if (g.date < t) return true;
    if (g.date > t) return false;
    var tip = tipOff(g);
    return tip !== null && nowMs() > tip + GAME_MS;
  }
  /* Something a supporter can still turn up to. */
  function isActionable(g) { return !isOver(g) && !g.annulled; }
  /* Over, not voided, and no score filed yet. */
  function awaitingResult(g) { return isOver(g) && !g.played && !g.annulled; }
  /* A free ticket only where entry really is free: a home game at one of our
     own halls (Nørre Fælled, Svanemøllehallen, Strandvejsskolen). homeCourt
     comes from build-fixtures.py HOME_VENUES and from the Worker. A "home"
     game at another club's hall is theirs to run (Deng, 6 Oct 2026). */
  function canClaim(g) {
    return isActionable(g) && !!g.home && !!g.homeCourt && g.state !== 'moving';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 'Mangler Tid' means missing TIME, not missing date. Saying TBC against a
     real date is honest; inventing a tip-off is not. */

  /* Just the clock. For the ticker card and the ticket modal, which already
     print the date on their own line right above this. */
  function timeOnly(g) {
    if (g.state === 'moving') return 'BEING MOVED';
    return g.time || 'TIME TBC';
  }

  /* 🔴 The DATE, not just the weekday (Deng, 11 Sep 2026). This read 'FRI, 19:40'
     and the month only existed as a section heading, so once you had scrolled or
     filtered, every row was some Friday and you could not tell which. A season
     list carries four or five Fridays a month. */
  function timeLabel(g) {
    if (g.state === 'moving') return dayName(g.date) + ' ' + shortDate(g.date).toUpperCase() + ', BEING MOVED';
    if (g.time) return dayName(g.date) + ' ' + shortDate(g.date).toUpperCase() + ', ' + g.time;
    return dayName(g.date) + ' ' + shortDate(g.date).toUpperCase() + ', TIME TBC';
  }

  function venueLabel(g) {
    if (!g.venue) return 'Venue to confirm';
    return g.venue + (g.court && g.court !== 'Hallen' ? ' · ' + g.court : '');
  }

  /* ---------- add to calendar, directions, share (6 Oct 2026) ---------- */

  /* Our own halls only, from data/facts.json venue.*. Any other hall uses the
     address Holdsport carries (venueAddr, kept by merge) or a plain search on
     the hall name. Never a guessed street address. */
  var VENUE_ADDR = [
    ['Nørre Fælled', 'Nørre Fælled Skole, Biskop Krags Vænge 7, 2200 København N'],
    ['Svanemølle', 'Svanemøllehallen, Østerbrogade 240, 2100 København Ø'],
    ['Strandvejsskolen', 'Strandvejsskolen, Sionsgade 1, 2100 København Ø']
  ];
  function placeOf(g) {
    if (g.venueAddr) return g.venueAddr.replace(/\s+/g, ' ');
    var v = g.venue || '';
    for (var i = 0; i < VENUE_ADDR.length; i++) {
      if (v.indexOf(VENUE_ADDR[i][0]) === 0) return VENUE_ADDR[i][1];
    }
    return v ? v + ', Denmark' : '';
  }
  function mapsURL(g) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(placeOf(g));
  }
  function shareURL(g) {
    return 'https://talatabasketball.dk/games?utm_source=share#g-' + encodeURIComponent(String(g.id));
  }
  function gameTitle(g) {
    return squadName(g.team) + (g.home ? ' vs ' : ' at ') + oppLabel(g);
  }

  /* iCalendar text. UTC times from tipOff, CRLF lines folded at 75 octets,
     text escaped. The UID is stable, so adding the same game twice updates
     the one event instead of making two. */
  function icsStamp(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsFold(line) {
    var out = [], cur = '', bytes = 0, max = 75;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i), cp = line.charCodeAt(i);
      if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < line.length) { ch += line.charAt(++i); }
      var b = encodeURIComponent(ch).replace(/%[0-9A-F]{2}/g, 'x').length;
      if (bytes + b > max) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function icsFile(g) {
    var t = tipOff(g);
    if (t === null) return '';
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Talata Basketball//Games//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:talata-' + String(g.id).replace(/[^\w.-]/g, '') + '@talatabasketball.dk',
      'DTSTAMP:' + icsStamp(Date.now()),
      'DTSTART:' + icsStamp(t),
      'DTEND:' + icsStamp(t + 2 * 3600000),
      'SUMMARY:' + icsText(gameTitle(g)),
      'LOCATION:' + icsText(placeOf(g) || venueLabel(g)),
      'DESCRIPTION:' + icsText((g.competition ? g.competition + '. ' : '') +
        (canClaim(g) ? 'Free entry. ' : '') + shareURL(g)),
      'URL:' + shareURL(g),
      'END:VEVENT', 'END:VCALENDAR'
    ];
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  /* The three small doors on every game still to come. A data: link rather
     than a blob, because iOS Safari opens a data:text/calendar straight into
     Calendar. */
  function extrasHTML(g) {
    if (!isActionable(g)) return '';
    var ics = icsFile(g);
    return '<div class="tf-extras">' +
      (ics
        ? '<a class="tf-mini" href="data:text/calendar;charset=utf-8,' + encodeURIComponent(ics) + '"' +
            ' download="talata-' + esc(String(g.id).replace(/[^\w.-]/g, '')) + '.ics" data-track="game-ics">Add to calendar</a>'
        : '') +
      (g.venue
        ? '<a class="tf-mini" href="' + esc(mapsURL(g)) + '" target="_blank" rel="noopener" data-track="game-map">Directions</a>'
        : '') +
      '<button type="button" class="tf-mini" data-tf-share="' + esc(g.id) + '" data-track="game-share">Share</button>' +
    '</div>';
  }

  function wireShare(scope) {
    var nodes = (scope || document).querySelectorAll('[data-tf-share]');
    Array.prototype.forEach.call(nodes, function (btn) {
      if (btn._tfWired) return;
      btn._tfWired = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var g = findGame(btn.getAttribute('data-tf-share'));
        if (!g) return;
        var url = shareURL(g);
        var text = gameTitle(g) + ', ' + DAYS_LONG[parseISO(g.date).getDay()] + ' ' + longDate(g.date) +
          (g.time ? ' at ' + g.time : '') + '.';
        var copied = function () {
          btn.textContent = 'Link copied';
          setTimeout(function () { btn.textContent = 'Share'; }, 2500);
        };
        if (navigator.share) {
          navigator.share({ title: gameTitle(g), text: text, url: url }).catch(function () { /* closed the sheet */ });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(copied, function () { window.prompt('Copy this link', url); });
        } else {
          window.prompt('Copy this link', url);
        }
      });
    });
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

  /* Friday nights only (6 Oct 2026). The Sun 8 Nov U9 morning is at the same
     hall and is not a Talata Night. */
  function isTalataNight(g) {
    return !!(g.home && g.venue && g.venue.indexOf('Nørre Fælled') === 0 &&
      g.date && parseISO(g.date).getDay() === 5);
  }

  /* ---------- crests ---------- */

  /* Real club crests, taken from each club's own public site (policy set by
     Deng, 26 Aug 2026). NSBU has no website at all, so it falls back to a
     monogram, which is why a manifest is consulted instead of a filename
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

  /* Everything that is not the league. St\u00e6vner and trips (inv, se, es), plus
     the Danish Cup (Deng, 8 Sep 2026: "add the danish cup to tournaments too").
     compKind already separates the destinations; source==='tournament' catches
     a hand-typed row whose competition name carries no word compKind knows. */
  function isTournament(g) {
    if (g.source === 'tournament') return true;
    var k = compKind(g);
    return k === 'inv' || k === 'se' || k === 'es' || k === 'cup';
  }

  /* ---------- merge ---------- */

  /* Holdsport names a squad the way the club calendar does. The federation
     file names it by age bracket. Same game, two labels. */
  var TEAM_ALIAS = { Mini: 'U9', Junior: 'U11' };
  function tKey(team) { return TEAM_ALIAS[team] || team || ''; }

  /* "BMS Herlev 2 vs Talata" and "Hørsholm vs Talata U15" are how Holdsport
     titles an away game. The opponent is the part before "vs Talata". */
  function cleanOpp(s) {
    if (s == null) return s;
    return String(s).replace(/\s+vs\.?\s+(?:Team\s+)?Talata\b.*$/i, '').replace(/\s+/g, ' ').trim();
  }

  function fold(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').trim();
  }
  /* Loose on purpose: "HBBF 3" and "Hovedstadens BBF 3", "Køge bugt" and
     "Køge Bugt". Same first letter, and the same team number when both carry
     one. A blank side matches anything (the U9 home morning has no opponent). */
  function oppOk(a, b) {
    var x = fold(a), y = fold(b);
    if (!x || !y) return true;
    if (x.charAt(0) !== y.charAt(0)) return false;
    var nx = /(\d+)$/.exec(x), ny = /(\d+)$/.exec(y);
    return !(nx && ny && nx[1] !== ny[1]);
  }

  /* An old /games#g-activity... link still opens the game after its Holdsport
     copy was folded into the federation row. Live id -> kept id. */
  var aliases = {};

  function merge(staticGames, liveGames) {
    /* Copies, so a venue address carried over below never leaks into the
       static list the next paint starts from. */
    staticGames = staticGames.map(function (g) { return Object.assign({}, g); });
    var byId = {};
    staticGames.forEach(function (g) { byId[g.id] = g; });
    /* A tournament typed into tournaments.json also exists in Holdsport as one
       loose activity per day ("BMS Herlev cup", U19, no opponent). Drop the
       Holdsport copy when a typed game already sits on that date for that
       team, otherwise the strip shows a blank row next to the real ones. */
    var typed = {};
    staticGames.forEach(function (g) { if (g.source === 'tournament') typed[g.date + '|' + g.team] = true; });
    /* Second key, 6 Oct 2026. Holdsport carries no DBBF number on the U13 and
       Mini games, so 25 Oct Køge Bugt showed twice. Same date, same squad, same
       tip-off and a matching opponent is the same game. */
    var slot = {};
    staticGames.forEach(function (g) {
      var k = g.date + '|' + tKey(g.team) + '|' + (g.time || '');
      (slot[k] = slot[k] || []).push(g);
    });
    var drop = function (g, kept) {
      aliases[g.id] = kept.id;
      /* Holdsport often has the street address ("Amagerhallen, Stor bane,
         Løjtegårdsvej 58, Kastrup"). Keep it for directions. */
      if (!kept.venueAddr && g.venue && g.venue.indexOf(',') > 0) kept.venueAddr = g.venue;
      return false;
    };
    var live = (liveGames || []).filter(function (g) {
      /* A cancelled game stays in Holdsport with AFLYST in front of its title.
         It rendered as a home game with a ticket (4 Dec, U19 v Gladsaxe 2). */
      if (/^\s*(aflyst|cancel+ed)\b/i.test(g.title || '')) return false;
      if (g.dbbfId && byId[g.dbbfId]) return drop(g, byId[g.dbbfId]);   /* the federation copy wins */
      if (!g.dbbfId && typed[g.date + '|' + g.team]) return false;
      var same = (slot[g.date + '|' + tKey(g.team) + '|' + (g.time || '')] || [])
        .filter(function (s) { return oppOk(s.opponent, cleanOpp(g.opponent)); })[0];
      if (same) return drop(g, same);
      return true;
    }).map(function (g) {
      var c = Object.assign({}, g);
      c.opponent = cleanOpp(g.opponent) || null;
      return c;
    });
    return staticGames.concat(live).sort(function (a, b) {
      return (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));
    });
  }

  /* The name a row prints for the other side. Never blank and never the raw
     Holdsport title, which is Danish admin text ("Grand Prix stævne U9 home
     game."). */
  function oppLabel(g) {
    if (g.opponent) return g.opponent;
    var c = g.competition || '';
    if (c && !/^(game|cup|kamp)$/i.test(c)) return c;
    if (isTournament(g)) return 'Tournament';
    return 'Opponent to confirm';
  }

  /* `!g.annulled` rides beside `!g.played` everywhere a game can become "next"
     (15 Sep 2026). The annulled Hørsholm cup win keeps its score, so played
     already keeps it out; the flag is there so a result the federation voids
     before a score is typed can never come back as a fixture to turn up to. */
  function upcoming(games) {
    return games.filter(isActionable);
  }

  /* A win is a played game we lead that still counts. DBBF annulled the 7 Sep
     78 67 over Hørsholm on protest and the tie was replayed on 14 Sep (Deng,
     15 Sep 2026: keep both stats). The old score stays on the page, tagged
     Annulled, and nothing paints it in the win colour. */
  function isWin(g) { return !!g.played && !g.annulled && g.us > g.them; }

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

  /* ---------- posters ---------- */

  /* The poster for a game, or null. Read from /data/posters.json, so nothing
     here depends on it: no file, no entry, no img means no poster, and every
     caller renders the plain version it rendered before. */
  /* A path from posters.json is dropped into href, src and srcset as-is, so it
     is only accepted when it is one of ours: a site-relative path ("/images/..."
     but never "//host", which is a different site) or a full https URL. A
     javascript: or data: string, a number, an object, all read as no path. */
  function safePath(u) {
    if (typeof u !== 'string') return '';
    u = u.trim();
    if (u.charAt(0) === '/' && u.charAt(1) !== '/') return u;
    if (u.indexOf('https://') === 0 && u.length > 8) return u;
    return '';
  }

  function posterFor(g) {
    if (!g) return null;
    /* Keyed on the DBBF number. A Holdsport copy of the same game carries it
       as dbbfId, so the poster follows the game whichever source won. Own
       keys only, so an id that happens to spell an Object method reads as
       no entry. */
    var own = function (k) {
      return k != null && Object.prototype.hasOwnProperty.call(posters, String(k))
        ? posters[String(k)] : null;
    };
    var p = own(g.id) || own(g.dbbfId);
    if (!p || typeof p !== 'object') return null;
    var img = safePath(p.img);
    if (!img) return null;
    /* Hand back a copy with the paths already checked, so no caller has to
       remember to. A thumb that fails the check falls back to the full file,
       an article that fails simply loses its link. */
    return {
      img: img,
      thumb: safePath(p.thumb) || img,
      article: safePath(p.article),
      alt: p.alt, label: p.label, w: p.w, h: p.h, og: p.og
    };
  }

  /* The -540 thumb is the poster at half size, so its box comes from w and h
     rather than being typed twice. 1080x1350 is the Instagram portrait every
     poster is exported at. */
  function posterThumb(p) {
    var w = parseInt(p.w, 10), h = parseInt(p.h, 10);
    if (!(w > 0)) w = 1080;
    if (!(h > 0)) h = 1350;
    return { src: p.thumb || p.img, w: Math.round(w / 2), h: Math.round(h / 2) };
  }

  /* The compact block the detail panel carries when a game has a poster: the
     thumb and one line that goes to the story. A column beside the panel on
     desktop, a strip under it on a phone, so the countdown and the ticket
     button never move down more than the thumb is tall. */
  function posterHTML(g) {
    var p = posterFor(g);
    if (!p || !p.article) return '';
    var th = posterThumb(p);
    return '<a class="tf-poster" href="' + esc(p.article) + '">' +
        '<img src="' + esc(th.src) + '" width="' + th.w + '" height="' + th.h + '"' +
          ' alt="' + esc(p.alt || '') + '" loading="lazy" decoding="async">' +
        '<span><b>' + esc(p.label || 'Cup night') + '.</b> Read the story</span>' +
      '</a>';
  }

  /* ---------- box score ----------
     Deng, 8 Sep 2026: the Men get a full box score behind the details click.
     Youth games carry the score and nothing else, which keeps the 31 Aug rule
     (results public, the reading of them internal) for every child on a team
     sheet. The data is typed into data/results.json from the MVP sheet. */
  function boxFor(g) {
    var st = stats[String(g.id)];
    if (!g.played || !st || !st.box || !st.box.length) return null;
    if (g.team !== 'Men') return null;
    return st;
  }
  function boxHTML(g) {
    var st = boxFor(g);
    if (!st) return '';
    var num = function (v) { return v === null || v === undefined ? '' : esc(String(v)); };
    /* A column no row fills is left off (15 Sep 2026). The Hørsholm replay
       sheet has no game clock and its shirt numbers are unverified, so that
       box carries num and min as null, and two empty columns read as missing
       data. The 7 Sep box has both and keeps both. */
    var has = function (k) {
      return st.box.some(function (p) { return p[k] !== null && p[k] !== undefined && p[k] !== ''; });
    };
    var showNum = has('num'), showMin = has('min');
    var rows = st.box.map(function (p) {
      return '<tr>' + (showNum ? '<td class="n">' + num(p.num) + '</td>' : '') +
        '<td class="p">' + esc(p.name || '') + '</td>' +
        (showMin ? '<td>' + esc(p.min || '') + '</td>' : '') + '<td class="pts">' + num(p.pts) + '</td>' +
        '<td>' + esc(p.ft || '') + '</td><td>' + num(p.fg) + '</td><td>' + num(p.pf) + '</td></tr>';
    }).join('');
    var t = st.totals || {};
    var tot = t.pts === undefined ? '' :
      '<tr class="tot">' + (showNum ? '<td></td>' : '') + '<td class="p">Talata</td>' +
      (showMin ? '<td></td>' : '') + '<td class="pts">' + num(t.pts) + '</td>' +
      '<td>' + esc(t.ft || '') + '</td><td>' + num(t.fg) + '</td><td>' + num(t.pf) + '</td></tr>';
    /* talata-fixtures.css left-aligns the SECOND header cell, because Player
       always sat there behind #. With no # column Player is first and a number
       is second, so those two carry their alignment here. */
    var cols = (showNum ? ['#'] : []).concat(['Player'], showMin ? ['Min'] : [], ['Pts', 'FT', 'FG', 'PF']);
    var head = cols.map(function (c, i) {
      var align = showNum ? ''
        : (c === 'Player' ? ' style="text-align:left"' : (i === 1 ? ' style="text-align:right"' : ''));
      return '<th' + align + '>' + c + '</th>';
    }).join('');
    return '<div class="tf-box">' +
        '<div class="tf-box-h"><b>Box score</b><span>Talata ' + num(g.us) + ', ' +
          esc(oppLabel(g)) + ' ' + num(g.them) +
          (g.ot ? ' after overtime' : '') + (g.annulled ? '. Annulled' : '') + '</span></div>' +
        '<div class="tf-box-scroll"><table>' +
          '<thead><tr>' + head + '</tr></thead>' +
          '<tbody>' + rows + tot + '</tbody></table></div>' +
        '<p class="tf-box-src">FG is made field goals. From the official scoresheet.</p>' +
      '</div>';
  }

  /* ---------- feature (next game) ---------- */

  /* The detail panel. One markup for the feature game at the top of the page
     and for the panel a fixture row opens, so a game looks the same wherever
     you meet it. Modelled on zalgiris.lt (Deng, 26 Aug). */
  function detailHTML(g, kick) {
    var opp = oppLabel(g);
    var t = tipOff(g);
    var act = isActionable(g);
    var poster = posterHTML(g);
    var row = function (k, v) {
      return '<div class="tf-row"><span>' + k + '</span><b>' + v + '</b></div>';
    };
    return '<div class="tf-feat tf-k-' + compKind(g) + (poster ? ' has-poster' : '') + (kick ? ' has-kick' : '') + '">' +
        (kick ? '<p class="tf-feat-kick">' + esc(kick) + '</p>' : '') +
        '<div class="tf-feat-main">' +
          '<div class="tf-feat-side">' + talataCrest(g.team) + '<span>Talata</span></div>' +
          '<div class="tf-feat-mid">' +
            '<p class="tf-feat-date">' + esc(dayName(g.date) + ' ' + longDate(g.date).toUpperCase()) + '</p>' +
            '<p class="tf-feat-time">' + esc(g.time || 'TBC') + '</p>' +
            '<span class="tf-feat-badge">' + esc(g.team) + '</span>' +
          '</div>' +
          '<div class="tf-feat-side">' + crestHTML(opp) + '<span>' + esc(opp) + '</span></div>' +
        '</div>' +
        '<div class="tf-feat-info">' +
          row('Competition', esc(g.competition)) +
          row('Venue', g.venue
            ? '<a class="tf-map" href="' + esc(mapsURL(g)) + '" target="_blank" rel="noopener" data-track="game-map">' +
                esc(venueLabel(g)) + '</a>'
            : esc(venueLabel(g))) +
          row('Home or away', g.home
            ? (isTalataNight(g) ? '<b class="tf-hl">Talata Night</b>' : 'Home')
            : 'Away') +
          (g.played
            ? row('Result', (isWin(g) ? 'Won ' : 'Final ') +
                esc(String(g.us)) + ' to ' + esc(String(g.them)) +
                (g.ot ? ' OT' : '') +
                (g.annulled ? ' <i class="tf-r-tag is-annulled">Annulled</i>' : ''))
            : (awaitingResult(g)
                ? row('Result', (isTournament(g) || /grand prix/i.test(g.competition || ''))
                    ? 'Played' : 'Result to come')
                : (t && act
                 ? '<div class="tf-row"><span>Time left</span>' +
                   '<div class="tf-cd" data-tf-cd="' + t + '"></div></div>'
                 : row('Tip-off', g.annulled
                     ? 'Annulled'
                     : (g.state === 'moving'
                       ? 'Being moved, date can change'
                       : 'The federation has not set one yet'))))) +
          /* Hand-typed in results.json and public on purpose. The annulled
             7 Sep game says why it no longer counts and where the replay went. */
          (g.note ? row('Note', esc(g.note)) : '') +
          '<div class="tf-feat-cta">' +
            (canClaim(g)
              ? '<button class="tf-btn is-primary" data-tf-claim="' + esc(g.id) +
                '" data-tf-date="' + esc(g.date) + '" data-track="game-claim">Claim free ticket</button>'
              : '') +
            /* #season exists on /games only. The row panel on /men and
               /academy needs the full path. */
            '<a class="tf-btn" href="' + (document.getElementById('season') ? '#season' : '/games#season') +
              '">All games</a>' +
          '</div>' +
          extrasHTML(g) +
        '</div>' +
        poster +
        boxHTML(g) +
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

  /* Who the feature panel is allowed to show (Deng, 21 Sep 2026). The export
     carries the U9 and U13 Grand Prix rounds, and one of those led the page:
     a U9 pool game is not what we ask a hall to turn up for. Cup ties qualify
     whatever the age, everything else has to be Men, U19 or U15. The younger
     games keep their rows in the list below. */
  var FEATURE_TEAMS = { Men: 1, U19: 1, U15: 1 };
  function featureEligible(g) {
    return isCup(g) || !!FEATURE_TEAMS[g.team];
  }

  function renderFeature(el, games) {
    /* Lead with a game somebody can actually turn up to. The very next fixture
       may have neither an agreed time nor a venue, and two TBCs at the top of
       the page is a poor first thing to see. It still appears in the list
       below, in date order, so nothing is hidden. */
    /* Home, or a cup tie anywhere. The 1/8 at BK Amager is the game Deng most
       wants a travelling crowd at, and a home-only rule pushed it off the top
       of the page in favour of a league game five weeks out (21 Sep 2026). */
    var showable = games.filter(function (x) {
      return (x.home || isCup(x)) && x.state === 'confirmed' && x.venue
          && isActionable(x) && featureEligible(x);
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
    /* Fallbacks stay inside the same rules: an eligible game we have not played
       yet, then any upcoming game at all. A finished game never leads. */
    var g = pool[0]
         || games.filter(function (x) {
              return x.state === 'confirmed' && isActionable(x) && featureEligible(x);
            })[0]
         || games.filter(isActionable)[0];
    /* 🔴 Deng, 6 Oct 2026: the hero is the next home game at our own halls,
       any team, the one people can walk in to with a free ticket. The rules
       above only decide when there is no such game left. The ticker's Next up
       and this card now point at the same Friday. */
    var home = games.filter(function (x) {
      return canClaim(x) && x.state === 'confirmed' && !!x.time;
    })[0];
    var kick;
    if (home) { g = home; kick = kickFor(home); }
    else if (g) kick = isCup(g) ? 'Cup night' : 'Next big game';
    if (!g) { el.innerHTML = ''; return; }
    el.innerHTML = detailHTML(g, kick);
    startCountdowns(el);
    wireClaims(el);
  }

  /* ---------- next home game banner (homepage, 6 Oct 2026) ----------
     Sits above This week at Talata. On a phone Friday is four swipes away in
     the strip, so this puts the game in view. A free home game in the next 7
     days gets the full navy panel with the countdown and the ticket. Further
     out it is one slim line. No home game left, no banner. */
  function kickFor(g) {
    var d = daysAway(g), night = isTalataNight(g), k;
    if (d === 0) k = (g.time && g.time >= '17:00') ? 'Tonight' : 'Today';
    else if (d === 1) k = 'Tomorrow';
    else if (d <= 7) k = (d <= 6 ? 'This ' : 'Next ') + DAYS_LONG[parseISO(g.date).getDay()];
    else k = 'Next home game';
    return night ? k + ' · Talata Night' : k;
  }

  function renderNext(el, games) {
    var home = games.filter(canClaim);
    var soon = home.filter(function (g) { return daysAway(g) <= 7; })[0];
    var g = soon || home[0];
    if (!g) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    var href = '/games#g-' + encodeURIComponent(String(g.id));
    var match = esc(g.team) + ' vs ' + esc(oppLabel(g));
    if (!soon) {
      el.innerHTML =
        '<a class="tf-next is-slim" href="' + href + '" data-track="next-game">' +
          '<span class="tf-next-kick">Next home game</span>' +
          '<span class="tf-next-line">' +
            esc(dayName(g.date).charAt(0) + dayName(g.date).slice(1).toLowerCase() + ' ' + shortDate(g.date)) +
            ', ' + match + '</span>' +
          '<i aria-hidden="true">&rsaquo;</i>' +
        '</a>';
      return;
    }
    var t = tipOff(g);
    el.innerHTML =
      '<div class="tf-next is-big">' +
        '<div class="tf-next-main">' +
          '<p class="tf-next-kick">' + esc(kickFor(g)) + '</p>' +
          '<div class="tf-next-match">' +
            '<span class="tf-next-crests">' + talataCrest(g.team) + crestHTML(oppLabel(g)) + '</span>' +
            '<span class="tf-next-h">' + match + '</span>' +
          '</div>' +
          '<p class="tf-next-when">' + esc(g.time || 'Time to confirm') + ' · ' + esc(venueLabel(g)) + ' · Free entry</p>' +
        '</div>' +
        (t ? '<div class="tf-cd tf-next-cd" data-tf-cd="' + t + '"></div>' : '') +
        '<div class="tf-next-cta">' +
          '<button class="tf-btn is-primary" data-tf-claim="' + esc(g.id) + '" data-tf-date="' + esc(g.date) +
            '" data-track="next-claim">Claim a free ticket</button>' +
          '<a class="tf-btn" href="' + href + '" data-track="next-details">Game details</a>' +
        '</div>' +
        extrasHTML(g) +
      '</div>';
    startCountdowns(el);
    wireClaims(el);
  }

  /* A fixture row opens the same panel in a dialog. Zalgiris puts a DETAILS
     button on every row; here the whole row is the target, which is a bigger
     tap area on a phone and needs no extra column. */
  /* By id, through the Holdsport alias map, so an old activity id still
     finds the federation row that replaced it. */
  function findGame(id) {
    id = String(id);
    if (Object.prototype.hasOwnProperty.call(aliases, id)) id = String(aliases[id]);
    return allGames.filter(function (x) { return String(x.id) === id; })[0] || null;
  }

  function openDetails(gameId) {
    var g = findGame(gameId);
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
    var close = function () {
      wrap.innerHTML = '';
      /* The card that opened this wrote #g-<id>. Drop it without a scroll jump,
         so tapping the same card again is a fresh hashchange, and so a reload
         lands on the list rather than back inside the panel. */
      if (/^#g-/.test(location.hash || '')) {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (err) { /* old browser */ }
      }
    };
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
    var opp = oppLabel(g);
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
    var sLeft = g.played ? (home ? g.us : g.them) : null;
    var sRight = g.played ? (home ? g.them : g.us) : null;
    var won = isWin(g);
    /* Mark the side that actually won, not both numbers. `.tf-r.is-won
       .tf-r-score` used to paint the pair green, so a 41-59 win showed the
       opponent's 41 in the win colour too. An annulled game marks neither. */
    var counts = g.played && !g.annulled;
    /* Nothing to say in the action cell: a phone row lets the date take the
       full width instead of drawing an empty box. */
    var noAct = !canClaim(g) && !(g.played && boxFor(g)) && !awaitingResult(g);
    /* Only our number goes green, and only on a win. A loss is the plain
       score (Deng, 6 Oct 2026: losses plain, youth restraint). */
    var lWon = counts && won && sLeft > sRight;
    var rWon = counts && won && sRight > sLeft;

    return '<article data-tf-open="' + esc(g.id) + '" tabindex="0" role="button"' +
      ' class="tf-r tf-k-' + compKind(g) + (home ? ' is-home' : '') + (noAct ? ' no-act' : '') +
        (g.state !== 'confirmed' ? ' is-tbc' : '') +
        (g.annulled ? ' is-annulled' : (g.played ? (won ? ' is-won' : ' is-lost') : '')) + '">' +
      '<div class="tf-r-comp"><span>' + esc(g.competition) + '</span>' +
        '<b>' + esc(timeLabel(g)) +
        (isTalataNight(g) ? ' <i class="tf-r-tag">Talata Night</i>' : '') +
        /* Same pill as Talata Night, so it wraps under the date the same way
           on a phone. The score beside it stays, uncoloured. */
        (g.annulled ? ' <i class="tf-r-tag is-annulled">Annulled</i>' : '') +
        '</b>' +
        /* Phone only: the venue cell is hidden under 560px, so the hall rides
           here as small text. */
        '<small class="tf-r-where">' + esc(venueLabel(g)) + '</small>' +
        '</div>' +
      '<div class="tf-r-venue"><span>' + (home ? 'Home' : 'Away') + '</span><b>' + esc(venueLabel(g)) + '</b></div>' +
      '<div class="tf-r-match">' +
        '<span class="tf-r-team is-l">' + left + '</span>' + leftCrest +
        /* One scoreline, not two pills. Two boxes read as two unrelated
           numbers; a scoreline reads as a result. No dash glyph between them
           (6 Oct 2026), and a game still to come shows "vs" with no number
           boxes at all. */
        (g.played
          ? '<span class="tf-r-score is-done">' +
              '<b' + (lWon ? ' class="is-w"' : '') + '>' + sLeft + '</b>' +
              '<b' + (rWon ? ' class="is-w"' : '') + '>' + sRight + '</b>' +
              /* Inside the scoreline, in the muted small type, so 89 87 OT
                 reads as one result. */
              (g.ot ? '<i class="tf-r-ot" title="After overtime">OT</i>' : '') +
              /* A W on wins only (Deng, 6 Oct 2026). A loss shows the plain
                 score, which is the youth restraint. */
              (won ? '<i class="tf-r-wl is-w" title="Won">W</i>' : '') +
            '</span>'
          : '<span class="tf-r-score is-vs"><i>vs</i></span>') +
        rightCrest + '<span class="tf-r-team is-r">' + right + '</span>' +
      '</div>' +
      '<div class="tf-r-act">' +
        /* A ticket only where entry is ours to give (canClaim). An away row,
           or a "home" game at another club's hall, prints no label at all. */
        (canClaim(g)
          ? '<button class="tf-r-tix" data-tf-claim="' + esc(g.id) +
            '" data-tf-date="' + esc(g.date) + '">Free ticket</button>'
          : (g.played
              ? (boxFor(g) ? '<span class="tf-r-free">Box score</span>' : '')
              : (awaitingResult(g)
                  ? '<span class="tf-r-free">' +
                      ((isTournament(g) || /grand prix/i.test(g.competition || '')) ? 'Played' : 'Result to come') +
                    '</span>'
                  : ''))) +
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

  function renderRows(el, games, mark) {
    var limit = parseInt(el.getAttribute('data-limit') || '0', 10);
    var list = limit > 0 ? games.slice(0, limit) : games;

    if (!list.length) {
      el.innerHTML = '<p class="tf-empty">Try another filter, or <a href="/games">see the full season</a>.</p>';
      return;
    }
    /* mark: the first game still to come. The season fold draws a Today
       line right above it. */
    var todayLine = '<div class="tf-today" id="today"><span>Today</span></div>';
    var marked = false;
    var rowOf = function (g) {
      if (mark && g === mark && !marked) { marked = true; return todayLine + fixtureRow(g); }
      return fixtureRow(g);
    };

    var order = [], byMonth = {};
    list.forEach(function (g) {
      var k = monthKey(g.date);
      if (!byMonth[k]) { byMonth[k] = []; order.push(k); }
      byMonth[k].push(g);
    });

    var html = order.map(function (k) {
      return '<section class="tf-month"><h3 class="tf-mh">' + monthLabel(k) + '</h3>' +
        byMonth[k].map(rowOf).join('') + '</section>';
    }).join('');
    if (mark === true) html += todayLine;   /* everything is in the past */

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
      return isActionable(g) && tipOff(g) !== null;
    })[0] || {}).id;

    var cards = games.slice(0, 12).map(function (g) {
      var opp = oppLabel(g);
      var isNext = isActionable(g) && g.id === nextId;
      var won = isWin(g);
      var cup = isCup(g) && isActionable(g);
      return '<a class="tkc' + (g.home ? ' is-home' : '') + (isNext ? ' is-next' : '') +
        (cup ? ' is-cup' : '') +
        (g.played ? ' is-done' : '') + '" href="/games#g-' + encodeURIComponent(String(g.id)) + '">' +
        (cup ? '<span class="tkc-cup">Cup</span>' : '') +
        (isNext && !cup ? '<span class="tkc-nx">Next up</span>' : '') +
        '<div class="tkc-crests">' + talataCrest(g.team) +
          '<span class="tkc-sep">' + (g.home ? 'vs' : 'at') + '</span>' +
          crestHTML(opp) + '</div>' +
        '<span class="tkc-opp">' + esc(opp) + '</span>' +
        '<span class="tkc-squad">' + esc(squadName(g.team)) + '</span>' +
        (g.played
          ? '<span class="tkc-score' + (won ? ' is-won' : '') + '">' +
              esc(String(g.us)) + ' <i>to</i> ' + esc(String(g.them)) + '</span>' +
            /* An annulled result can land in the last three results this strip
               carries (15 Sep 2026, the Hørsholm cup tie), and it must not read
               as a finished game. The line under the score says which it is. */
            '<span class="tkc-when">' + (g.annulled ? 'ANNULLED' :
              ((won ? 'WON' : 'FINAL') + (g.ot ? ', OT' : ''))) + '</span>'
          : '<span class="tkc-date">' + esc(dayName(g.date) + ' ' + shortDate(g.date).toUpperCase()) + '</span>' +
            (isNext
              ? '<span class="tkc-cd tf-cd" data-tf-cd="' + tipOff(g) + '"></span>'
              : '<span class="tkc-when">' + esc(timeOnly(g)) + '</span>')) +
        (isTalataNight(g) && isActionable(g) ? '<span class="tkc-tag">Talata Night</span>' : '') +
      '</a>';
    }).join('');

    /* No auto-scroll (Deng, 26 Aug 2026): it was a moving target you had to
       wait for. One strip, parked on the next game, moved by the arrows, by a
       finger, and since 3 Sep 2026 by a mouse drag. Also removes the duplicated
       set the marquee needed, so a screen reader hears each fixture once with no
       aria-hidden clone. */
    el.innerHTML =
      '<div class="tk" role="region" aria-label="Upcoming Talata games">' +
        '<button class="tk-arw is-l" aria-label="Scroll back">&#8249;</button>' +
        '<div class="tk-viewport"><div class="tk-set">' + cards + '</div></div>' +
        '<button class="tk-arw is-r" aria-label="Scroll forward">&#8250;</button>' +
      '</div>';

    var vp = el.querySelector('.tk-viewport');
    var back = el.querySelector('.tk-arw.is-l');
    var fwd = el.querySelector('.tk-arw.is-r');

    /* HOW THE STRIP MOVES
       26 Aug 2026 (Deng): arrows only, no drag and no wheel. The viewport was
       overflow:hidden on every device and programmatic scrollLeft was the only
       thing that could shift it.
       2 Sep 2026 (Deng): a finger glides the strip on a phone. The CSS opened
       .tk-viewport to overflow-x:auto inside @media (hover:none) and
       (pointer:coarse), with a proximity scroll snap. Desktop kept
       overflow:hidden and the arrows.
       3 Sep 2026 (Deng): "I should be able to slide it with my fingers or the
       mouse, instead of it being sticky." Two answers. The scroll snap came out
       of the CSS entirely, because settling onto a card was the sticky. And the
       media query came out with it, so every pointer type scrolls the strip
       freely. Touch is the browser's own scrolling and stays untouched. A mouse
       gets the drag handler below. The arrows still work, they are real
       <button>s, and the strip is still reachable by keyboard. */
    var sync = function () {
      var max = vp.scrollWidth - vp.clientWidth - 1;
      back.disabled = vp.scrollLeft <= 0;
      fwd.disabled = vp.scrollLeft >= max;
    };
    /* Smooth is asked for here rather than set in CSS. A container carrying
       scroll-behavior:smooth animates every scrollLeft it is handed, and the
       drag hands it one per pointermove, which comes out as lag. Reduced motion
       gets an instant jump, which is what the CSS media query used to do. */
    var easy = !(window.matchMedia &&
                 window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var step = function (dir) {
      vp.scrollBy({
        left: dir * Math.max(200, vp.clientWidth * 0.8),
        behavior: easy ? 'smooth' : 'auto'
      });
      setTimeout(sync, 420);
    };
    back.addEventListener('click', function () { step(-1); });
    fwd.addEventListener('click', function () { step(1); });

    /* A swipe or a drag moves the strip with no button click behind it, so the
       disabled state has to follow the scroll as well as the buttons. Passive
       because this listener never calls preventDefault, and a non-passive one
       would make the browser wait on it before it lets the strip move. */
    vp.addEventListener('scroll', sync, { passive: true });

    /* renderTicker runs twice on every page load, once on the static
       fixtures.json and once when the Worker answers, and the second run
       replaces the whole strip. A resize listener from the first run would sit
       on window forever, syncing arrows on a viewport that left the document.
       Stash the handler on the host and take the old one off before adding. */
    if (el._tkResize) window.removeEventListener('resize', el._tkResize);
    el._tkResize = sync;
    window.addEventListener('resize', sync);
    sync();

    /* MOUSE DRAG (Deng, 3 Sep 2026). Pointer Events, mouse only.
       A finger already scrolls this natively and intercepting it means fighting
       the browser for the same gesture, so any non-mouse pointer falls straight
       through. Left button only, so a right-click stays a right-click. */
    var drag = null;

    /* A drag that ends on a card is followed by a real click on that card, and
       the card is an <a href="/games">. Swallow exactly one click in the
       capture phase, then disarm. Three ways off, because a click that never
       arrives must not leave this armed to eat the next one: the click itself,
       the next pointerdown, and a timer well past when the click would fire. */
    var eating = false, eatTimer = null;
    var disarmEat = function () {
      if (!eating) return;
      eating = false;
      vp.removeEventListener('click', eatClick, true);
      if (eatTimer) { clearTimeout(eatTimer); eatTimer = null; }
    };
    function eatClick(e) { e.preventDefault(); e.stopPropagation(); disarmEat(); }
    var armEat = function () {
      if (eating) return;
      eating = true;
      vp.addEventListener('click', eatClick, true);
      eatTimer = setTimeout(disarmEat, 400);
    };

    vp.addEventListener('pointerdown', function (e) {
      disarmEat();
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, left: vp.scrollLeft, moved: false };
      /* No preventDefault on pointerdown. It would eat the focus the card is
         about to take and put the strip off the keyboard. */
      try { vp.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
    });

    vp.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      /* 5px of slack before it counts as a drag, so a plain click on a card
         still opens the game instead of nudging the strip by a pixel. */
      if (!drag.moved) {
        if (Math.abs(dx) < 5) return;
        drag.moved = true;
        vp.classList.add('is-drag');
      }
      /* The assignment fires a scroll event, and sync() rides that. */
      vp.scrollLeft = drag.left - dx;
    });

    var endDrag = function (e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var moved = drag.moved, id = drag.id;
      drag = null;
      vp.classList.remove('is-drag');
      try { vp.releasePointerCapture(id); } catch (err) { /* already released */ }
      if (moved) armEat();
    };
    vp.addEventListener('pointerup', endDrag);
    vp.addEventListener('pointercancel', endDrag);

    /* Park the strip ON the next game rather than at its left edge, so results
       sit behind it and the rest of the season runs ahead of it. Zalgiris does
       this and Deng asked for the same on 27 Aug: last three results first, the
       next game in the middle. A one-off position, not an animation, so the
       "nothing moves on its own" rule from 26 Aug still holds.

       The snap-off / smooth-off dance that used to wrap this assignment is
       gone with the snap (3 Sep 2026). Nothing tugs the strip to a card edge
       any more and nothing animates a scrollLeft, so one assignment lands it. */
    var nextCard = el.querySelector('.tkc.is-next');
    if (nextCard) {
      requestAnimationFrame(function () {
        var want = nextCard.offsetLeft - (vp.clientWidth - nextCard.offsetWidth) / 2;
        vp.scrollLeft = Math.max(0, want);
        sync();
      });
    }

    startCountdowns(el);
  }

  /* One interval per host element. Both a card and its clone carry the
     attribute, so they stay in step. */
  function startCountdowns(host) {
    var nodes = host.querySelectorAll('[data-tf-cd]');
    if (!nodes.length) return;
    if (host._tfTimer) clearInterval(host._tfTimer);
    var tick = function () {
      var now = nowMs(), live = 0;
      Array.prototype.forEach.call(nodes, function (n) {
        var ms = parseInt(n.getAttribute('data-tf-cd'), 10) - now;
        /* Two and a half hours after tip-off the game is over: say nothing.
           Before that, while the ball is in the air, say so. */
        if (ms <= -GAME_MS) { n.innerHTML = ''; return; }
        live++;
        if (ms <= 0) { n.innerHTML = '<span><b>Live now</b></span>'; return; }
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
    wireShare(scope);
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
    var g = findGame(gameId);
    /* A button painted before the game tipped off (or a stale tab) must not
       open a ticket for a game that is over or at another club's hall. */
    if (!g || !canClaim(g)) {
      if (btn) { btn.disabled = true; btn.textContent = 'Tickets closed'; }
      return;
    }
    date = g.date || date;
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
          '<h3>' + esc(g.team || 'Talata') + ' vs ' + esc(oppLabel(g)) + '</h3>' +
          '<p class="tf-mwhen">' + esc(DAYS_LONG[parseISO(date).getDay()] + ' ' + longDate(date)) + ' · ' + esc(timeOnly(g)) +
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
          game: g.id, date: g.date || date, email: v,
          seats: form.querySelector('[name=seats]').value,
          team: teamFull(g.team),
          opponent: oppLabel(g),
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
    /* Opens on the games still to come (6 Oct 2026). It used to open at
       28 Aug, about 41 rows above the next game. The earlier games and their
       scores sit behind one fold; /games?view=results opens it. */
    var qs0 = new URLSearchParams(location.search);
    var state = { filter: 'all', past: qs0.get('view') === 'results' };
    var foldEl = document.createElement('div');
    foldEl.className = 'tf-scope tf-fold-wrap';
    out.parentNode.insertBefore(foldEl, out);

    var teams = [];
    allGames.forEach(function (g) { if (teams.indexOf(g.team) < 0) teams.push(g.team); });
    var hasTournament = allGames.some(isTournament);
    var order = ['Men', 'U19', 'U18', 'U17', 'Girls U17', 'U15', 'U14', 'U13', 'U11'];
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
        /* Deng, 8 Sep 2026: "add a tournament thing so you can just see
           tournaments", and the Danish Cup belongs in it. Everything that is
           not the league: st\u00e6vner, trips and the cup. Only shown when the
           season actually holds one. */
        .concat(hasTournament ? ['<button class="tf-chip" data-f="tournament">Tournaments</button>'] : [])
        .concat(teams.map(function (t) {
          return '<button class="tf-chip" data-f="team:' + esc(t) + '">' + esc(t) + '</button>';
        })).join('');
    }

    function paintList() {
      /* Whole season in date order. merge() already sorted it, so a played game
         sits under its own month above the fixtures still to come. */
      var base = allGames;
      var list = base, team = '';
      if (state.filter === 'home') list = base.filter(function (g) { return g.home; });
      else if (state.filter === 'away') list = base.filter(function (g) { return !g.home; });
      else if (state.filter === 'tournament') list = base.filter(isTournament);
      else if (state.filter.indexOf('team:') === 0) {
        team = state.filter.slice(5);
        list = base.filter(function (g) { return g.team === team; });
      }
      var past = list.filter(isOver);
      var ahead = list.filter(function (g) { return !isOver(g); });
      paintFold(past, ahead.length);
      if (state.past) {
        renderRows(out, list, ahead[0] || true);
      } else if (ahead.length) {
        renderRows(out, ahead);
      } else {
        out.innerHTML = '<p class="tf-empty">No more games this season' + (team ? ' for ' + esc(team) : '') +
          (past.length ? '. The results are just above.' : '. Try another filter.') + '</p>';
      }
    }

    function paintFold(past, aheadCount) {
      if (!past.length) { foldEl.innerHTML = ''; foldEl.hidden = true; return; }
      foldEl.hidden = false;
      var latest = past.filter(function (g) { return g.played; }).slice(-3).reverse();
      foldEl.innerHTML =
        '<button type="button" class="tf-fold" aria-expanded="' + (state.past ? 'true' : 'false') + '"' +
          ' data-track="season-fold">' +
          (state.past
            ? 'Hide earlier games'
            : 'Show ' + past.length + ' earlier ' + (past.length === 1 ? 'game' : 'games') + ' and results') +
        '</button>' +
        (!state.past && latest.length
          ? '<p class="tf-latest"><span>Latest results</span>' + latest.map(function (g) {
              return '<a href="#g-' + encodeURIComponent(String(g.id)) + '">' +
                esc(g.team) + (g.home ? ' vs ' : ' at ') + esc(oppLabel(g)) + ' <b>' +
                esc(String(g.us)) + ' to ' + esc(String(g.them)) + '</b>' +
                (isWin(g) ? ' <i class="tf-r-wl is-w" title="Won">W</i>' : '') + '</a>';
            }).join('') + '</p>'
          : '');
      var btn = foldEl.querySelector('.tf-fold');
      btn.addEventListener('click', function () {
        state.past = !state.past;
        paintList();
        if (state.past) {
          var t = document.getElementById('today');
          if (t && t.scrollIntoView) t.scrollIntoView({ block: 'center' });
        }
      });
    }
    /* openFromHash calls this when the linked game is already over. */
    host._tfShowPast = function () {
      if (state.past) return;
      state.past = true;
      paintList();
    };
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
    var qs = new URLSearchParams(location.search);
    if (barEl && qs.get('filter') === 'tournament' && hasTournament) {
      var tchip = barEl.querySelector('[data-f="tournament"]');
      if (tchip) {
        Array.prototype.forEach.call(barEl.querySelectorAll('.tf-chip'), function (x) {
          x.classList.toggle('is-on', x === tchip);
        });
        state.filter = 'tournament';
      }
    }
    var want = (qs.get('team') || '').trim();
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

    var cup = games.filter(function (g) {
      return isActionable(g) && isCup(g) && daysAway(g) <= CUP_WINDOW_DAYS;
    })[0];
    if (!cup || cupSeen(cup.id)) return;

    var when = DAYS_LONG[parseISO(cup.date).getDay()] + ' ' + longDate(cup.date) + (cup.time ? ', ' + cup.time : '');
    var opp = oppLabel(cup);
    var poster = posterFor(cup);
    /* A ticket only where we can give one (6 Oct 2026). The 24 Oct U13 tie
       is away at Amagerhallen, so the popup asks people to travel instead of
       promising free entry at somebody else's door. */
    var tix = canClaim(cup);
    var gameURL = '/games#g-' + encodeURIComponent(String(cup.id));

    /* The three lines both versions share. */
    var lines =
      '<p class="cup-kick">Danish Cup</p>' +
      '<p class="cup-h">' + esc(squadName(cup.team)) + (cup.home ? ' vs ' : ' at ') + esc(opp) + '</p>' +
      '<p class="cup-when"><b>' + esc(when) + '</b><br>' + esc(venueLabel(cup)) + '</p>';

    if (poster) {
      /* POSTER VERSION (6 Sep 2026). The graphic does the talking: poster on
         the left, the facts and two doors on the right. The poster opens the
         full size file in a new tab. Every restraint above still holds, this
         only changes what the popup looks like once it has earned its slot. */
      var th = posterThumb(poster);
      host.innerHTML =
        '<div class="cup-pop has-poster" role="dialog" aria-modal="false" aria-label="Cup game">' +
          '<button class="cup-x" aria-label="Close">&times;</button>' +
          '<a class="cup-poster" href="' + esc(poster.img) + '" target="_blank" rel="noopener">' +
            '<img src="' + esc(th.src) + '"' +
              ' srcset="' + esc(th.src) + ' ' + th.w + 'w, ' + esc(poster.img) + ' ' + (th.w * 2) + 'w"' +
              ' sizes="(max-width:600px) 33vw, 176px"' +
              ' width="' + th.w + '" height="' + th.h + '"' +
              ' alt="' + esc(poster.alt || '') + '" loading="lazy" decoding="async">' +
          '</a>' +
          '<div class="cup-body">' + lines +
            (tix ? '' : '<p class="cup-sub">' + (cup.home ? '' : 'Away day. ') + 'Come and back them.</p>') +
          '</div>' +
          '<div class="cup-acts">' +
            '<a class="cup-cta" href="' + gameURL + '">' +
              (tix ? 'Game details and free ticket' : 'Game details') + '</a>' +
            (poster.article
              ? '<a class="cup-cta cup-cta-ghost" href="' + esc(poster.article) + '">Read the story</a>'
              : '') +
          '</div>' +
        '</div>';
    } else {
      host.innerHTML =
        '<div class="cup-pop" role="dialog" aria-modal="false" aria-label="Cup game">' +
          '<button class="cup-x" aria-label="Close">&times;</button>' +
          lines +
          (tix
            ? '<p class="cup-sub">Free entry, like every home game. Claim a ticket so we know how many are coming.</p>' +
              '<a class="cup-cta" href="' + gameURL + '">Claim a free ticket</a>'
            : '<p class="cup-sub">' + (cup.home ? '' : 'Away day. ') + 'Come and back them.</p>' +
              '<a class="cup-cta" href="' + gameURL + '">Game details</a>') +
        '</div>';
    }

    /* Mark it seen on dismiss AND on every click through (the ticket link, the
       story, the poster itself), so somebody who claims a ticket is not asked
       again for the same game. */
    host.querySelector('.cup-x').addEventListener('click', function () {
      markCupSeen(cup.id); host.innerHTML = '';
    });
    Array.prototype.forEach.call(host.querySelectorAll('.cup-cta, .cup-poster'), function (a) {
      a.addEventListener('click', function () { markCupSeen(cup.id); });
    });
    requestAnimationFrame(function () {
      var box = host.querySelector('.cup-pop');
      if (box) box.classList.add('is-in');
    });
  }

  /* ---------- boot ---------- */

  /* A ticker card links to /games#g-<id> (8 Sep 2026). Before that every card
     went to plain /games, which on a phone landed on the feature panel for a
     different game and read as "I tapped a game and got nothing". Open the
     game the hash names once the list holds it: paint runs twice, static then
     live, and a Holdsport game only exists on the second run. */
  function openFromHash() {
    var m = /^#g-(.+)$/.exec(location.hash || '');
    if (!m) return false;
    var id;
    try { id = decodeURIComponent(m[1]); } catch (err) { id = m[1]; }
    var hit = findGame(id);
    if (!hit) return false;
    id = String(hit.id);
    /* A finished game sits behind the season fold. Open it first, so the row
       is there to scroll to behind the panel. */
    if (isOver(hit)) {
      document.querySelectorAll('[data-tf-host]').forEach(function (h) { if (h._tfShowPast) h._tfShowPast(); });
    }
    var row = document.querySelector('[data-tf-open="' + id.replace(/["\\]/g, '') + '"]');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    openDetails(id);
    return true;
  }

  function paint(games) {
    allGames = games;
    var next = upcoming(games);
    /* Last three results, then the next game, then the rest. Until the season
       starts there are no results, so this is simply the upcoming list, and it
       grows a history on its own as scoresheets are filed. */
    var strip = results(games).slice(0, 3).reverse().concat(next);
    document.querySelectorAll('[data-talata-ticker]').forEach(function (el) { renderTicker(el, strip); });
    document.querySelectorAll('[data-talata-feature]').forEach(function (el) { renderFeature(el, next); });
    document.querySelectorAll('[data-talata-next]').forEach(function (el) { renderNext(el, next); });
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

    /* Shared with the homepage week strip (talata-week.js), so This week at
       Talata draws from the same merged, deduped, clock-aware list as the
       ticker. week.js loads first; it reads this if it is already set and
       listens for the event if not. */
    window.TalataGames = games;
    window.TalataFx = {
      canClaim: canClaim, isOver: isOver, isTalataNight: isTalataNight,
      crestHTML: crestHTML, talataCrest: talataCrest, squadName: squadName, oppLabel: oppLabel
    };
    try { document.dispatchEvent(new CustomEvent('talata:games')); } catch (err) { /* very old browser */ }

    if (!paint._hashOpened) paint._hashOpened = openFromHash();
    if (!paint._hashWired) {
      paint._hashWired = true;
      window.addEventListener('hashchange', function () { openFromHash(); });
    }

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
            .catch(function () { return null; }),
          /* Posters ride along on the same terms as tournaments: null on any
             failure, so a missing or broken file changes nothing below. */
          fetch(POSTERS, { cache: 'no-cache' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; }),
          fetch(RESULTS, { cache: 'no-cache' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
        ])
          .then(function (all) {
            var d = all[0], t = all[1], p = all[2], st = all[3];
            posters = (p && p.posters && typeof p.posters === 'object') ? p.posters : {};
            stats = (st && typeof st === 'object') ? st : {};
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
