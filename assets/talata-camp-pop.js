/* Talata camp popup, the big one (Deng, 15 Oct 2026).
 *
 * "A really big pop-up, not a small one. As soon as you start scrolling, boom,
 * camp." It sells the December NBA and EuroLeague Pathway Camp on every page
 * until the camp starts.
 *
 *   - EVERY PAGE. The script rides in the shared footer block
 *     (tools/apply-shared-footer.py). It stays quiet on the camp page itself,
 *     the Coaches Clinic, /join and the shop, where it would block a form, and
 *     on Mini, Saturday and Talata & Co., where nobody is 13 to 17 (15 Oct 2026).
 *   - NEVER OVER A FORM. Once someone clicks into a form field, it stays shut
 *     for that page view, so it never lands on a half-typed trial form.
 *   - FIRST SCROLL. It shows once the page has scrolled SCROLL_PX, with no
 *     timer, so the hero is seen first and the card comes straight after.
 *   - ONCE A DAY. localStorage talata_camp_pop_v2 holds when it was closed or
 *     clicked through. It comes back after a day. If storage throws it just
 *     shows, which is the safe direction to fail.
 *   - FACTS, NOT TYPING. Name, days, ages, places and prices come from
 *     /data/facts.json (built from programs.md), so the price flips from the
 *     early bird to the standard price by itself after the deadline. No facts,
 *     no popup: a wrong price is worse than none.
 *   - PHONES wait for the cookie choice, so the card never sits on the banner.
 *   - ONE POPUP AT A TIME. It waits while the cup popup is up and sets
 *     window.__talataCampPopOpen so the cup popup stays quiet while this is open.
 *   - Its CSS (talata-camp-pop.css) loads only when it is about to show.
 *
 * Testing: ?camppop=dec forces it and clears the day flag. ?camppop=reset
 * clears the flag only.
 */
(function () {
  'use strict';

  var KEY = 'talata_camp_pop_v2';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var END = Date.parse('2026-12-27T23:59:00+01:00');   /* the camp starts Mon 28 Dec */
  var SCROLL_PX = 120;
  var RETRY_MS = 1000;
  var CAMP_URL = '/camps/college-pathway-camp-2026';
  var QUIET = ['/camps/college-pathway-camp-2026', '/camps/coaches-clinic-2026', '/join', '/shop',
               '/mini', '/saturday', '/talata-and-co'];
  var IMG = '/images/2026-10/site/pathway-camp-malmo-shot-hero.jpg';

  function path() {
    return (location.pathname || '/').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  }
  function lastSeen() {
    try { return parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function markSeen() {
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* fine */ }
  }
  function clearSeen() {
    try { localStorage.removeItem(KEY); } catch (e) { /* fine */ }
  }

  var force = false;
  try {
    var q = (new URLSearchParams(location.search).get('camppop') || '').toLowerCase();
    if (q === 'dec') { force = true; clearSeen(); }
    else if (q === 'reset') clearSeen();
  } catch (e) { /* very old browser: no test switch */ }

  if (!force) {
    if (Date.now() > END) return;
    if (QUIET.indexOf(path()) !== -1) return;
    if (Date.now() - lastSeen() < DAY_MS) return;
  }

  var me = document.currentScript;
  var stamp = (me && /\?v=([0-9a-z]+)/.exec(me.src || '') || [])[1] || '';

  var camp = null, cssReady = false, scrollOk = false, shown = false, waiting = false, typing = false;
  var back = null, card = null, lastFocus = null;

  /* ---- facts ------------------------------------------------------------ */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function kr(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' kr';
  }
  function dayName(y, m, d) {
    return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }
  function readCamp(doc) {
    var c = doc && doc.camps && doc.camps.pathway;
    if (!c || !c.name || !c.days || !c.days.length || !c.month || !c.price_standard) return null;
    var y = 2026;
    var first = c.days[0], last = c.days[c.days.length - 1];
    var out = {
      name: c.name,
      days: dayName(y, c.month, first) + ' ' + first + ' to ' + dayName(y, c.month, last) + ' ' + last + ' ' + MONTHS[c.month - 1],
      ages: c.age_min + ' to ' + c.age_max,
      places: c.places,
      time: c.time_start && c.time_end ? c.time_start + ' to ' + c.time_end : ''
    };
    var dl = c.eb_deadline ? Date.parse(c.eb_deadline + 'T23:59:59+01:00') : 0;
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.eb_deadline || '');
    if (c.price_early && dl && p && Date.now() <= dl) {
      var dy = +p[1], dm = +p[2], dd = +p[3];   /* read off the date itself, so no time zone moves it */
      out.price = '<b>' + kr(c.price_early) + '</b> to ' + dayName(dy, dm, dd) + ' ' + dd + ' ' + MON3[dm - 1] +
                  ', then ' + kr(c.price_standard);
    } else {
      out.price = '<b>' + kr(c.price_standard) + '</b>';
    }
    return out;
  }

  /* ---- the card --------------------------------------------------------- */
  function isPhone() {
    try { return window.matchMedia('(max-width:600px)').matches; } catch (e) { return false; }
  }
  /* The banner (#tc-consent, talata-consent.js) is in the page until a choice
     is made. Checking the banner rather than storage also covers a private
     window, where the choice is never stored but the banner still closes. */
  function consentDone() {
    if (document.readyState === 'loading') return false;
    return !document.getElementById('tc-consent');
  }
  function cupUp() {
    return !!document.querySelector('.cup-pop');
  }

  function build() {
    back = document.createElement('div');
    back.className = 'tcp-back';
    back.innerHTML =
      '<div class="tcp" role="dialog" aria-modal="true" aria-labelledby="tcp-h" tabindex="-1">' +
        '<button type="button" class="tcp-x" aria-label="Close the camp popup">&times;</button>' +
        '<img class="tcp-img" src="' + IMG + '" width="799" height="440" alt="Talata player rising for a jump shot over a defender in the arena in Malm&ouml;" decoding="async">' +
        '<div class="tcp-body">' +
          '<p class="tcp-kick">Christmas break camp</p>' +
          '<h2 class="tcp-h" id="tcp-h">' + camp.name + '</h2>' +
          '<p class="tcp-sub">Three days on what NBA, EuroLeague and college coaches look for, with Deng Awak and Jordan Naughton.</p>' +
          '<dl class="tcp-facts">' +
            '<div><dt>Days</dt><dd>' + camp.days + (camp.time ? ', ' + camp.time : '') + '</dd></div>' +
            '<div><dt>Ages</dt><dd>' + camp.ages + '</dd></div>' +
            '<div><dt>Where</dt><dd>Hafnia-Hallen, Copenhagen SV</dd></div>' +
            '<div class="tcp-price"><dt>Price</dt><dd>' + camp.price + '</dd></div>' +
          '</dl>' +
          '<p class="tcp-note">' + (camp.places ? camp.places + ' places. ' : '') + 'Deng and Jordan on court all three days, NBA and EuroLeague coaches on video. You get measured, filmed and a written evaluation to share with scouts.</p>' +
          '<div class="tcp-acts">' +
            '<a class="tcp-cta" href="' + CAMP_URL + '#camp-form" data-cta data-track="camp-pop big signup">Sign up for the December camp</a>' +
            '<a class="tcp-alt" href="' + CAMP_URL + '" data-track="camp-pop big details">See the camp</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    card = back.firstChild;
  }

  function focusables() {
    return Array.prototype.filter.call(
      card.querySelectorAll('a[href], button:not([disabled])'),
      function (el) { return el.offsetParent !== null; });
  }
  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Esc') { close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function close() {
    if (!back) return;
    markSeen();
    document.removeEventListener('keydown', onKey);
    if (back.parentNode) back.parentNode.removeChild(back);
    back = card = null;
    document.documentElement.classList.remove('tcp-lock');
    window.__talataCampPopOpen = false;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus) && lastFocus !== document.body) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { lastFocus.focus(); }
    }
  }

  function show() {
    shown = true;
    window.removeEventListener('scroll', onScroll);
    build();
    window.__talataCampPopOpen = true;
    lastFocus = document.activeElement;
    document.body.appendChild(back);
    document.documentElement.classList.add('tcp-lock');

    card.querySelector('.tcp-x').addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    Array.prototype.forEach.call(card.querySelectorAll('a'), function (a) {
      a.addEventListener('click', markSeen);
    });
    document.addEventListener('keydown', onKey);
    try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }
  }

  function attempt() {
    if (shown || typing || !scrollOk || !camp || !cssReady) return;
    if (cupUp() || (isPhone() && !consentDone())) {
      if (!waiting) {
        waiting = true;
        setTimeout(function () { waiting = false; attempt(); }, RETRY_MS);
      }
      return;
    }
    show();
  }

  function onScroll() {
    if (scrollOk) return;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (y >= SCROLL_PX || force) {
      scrollOk = true;
      attempt();
    }
  }

  /* Facts and CSS load in the background while the reader scrolls. */
  try {
    fetch('/data/facts.json', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (doc) { camp = readCamp(doc); attempt(); })
      .catch(function () { /* no facts, no popup */ });
  } catch (e) { return; }

  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/assets/talata-camp-pop.css' + (stamp ? '?v=' + stamp : '');
  css.onload = function () { cssReady = true; attempt(); };
  document.head.appendChild(css);

  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!force && t && t.closest && t.closest('form') && !(back && back.contains(t))) typing = true;
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();   /* a reload half way down the page already counts */
})();
