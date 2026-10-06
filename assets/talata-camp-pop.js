/* Talata camp popup, homepage only (Deng, 6 Oct 2026).
 *
 * The October camps (Mon 12 to Thu 15 Oct) are under-filled and sales close
 * Sun 11 Oct 20:00. This card sells them, then switches itself to the December
 * International Academy and College Pathway Camp until the early bird ends.
 *
 * The markup lives in <template id="camp-pop-tpl"> on index.html, so the prices
 * sit inside facts markers and tools/apply-facts.py keeps them in sync. This file
 * only picks a variant, waits, and shows it.
 *
 * The same restraint as the cup popup (talata-fixtures.js renderCupPopup):
 *   - HOMEPAGE ONLY. No template, no popup.
 *   - WAITS for BOTH 5 seconds on the page AND a scroll of 40% of a screen,
 *     so the hero and the free trial form are read first.
 *   - ONCE PER VARIANT. localStorage talata_camp_pop_seen_v1 holds the variant
 *     id, set on close and on any click through. If storage throws it just
 *     shows, which is the safe direction to fail.
 *   - PHONES wait for the cookie choice, so the sheet never sits on the banner.
 *   - ONE POPUP AT A TIME. It waits while the cup popup is up, and sets
 *     window.__talataCampPopOpen so the cup popup stays quiet while this is open.
 *
 * Testing: ?camppop=oct or ?camppop=dec forces that card and clears the seen
 * flag. ?camppop=reset clears the flag and keeps the date switch.
 */
(function () {
  'use strict';

  var KEY = 'talata_camp_pop_seen_v1';
  var OCT_END = Date.parse('2026-10-11T20:00:00+02:00');   /* October sales close */
  var DEC_END = Date.parse('2026-11-01T23:59:00+01:00');   /* December early bird ends */
  var DELAY_MS = 5000;
  var SCROLL_SHARE = 0.4;
  var RETRY_MS = 1000;

  var tpl = document.getElementById('camp-pop-tpl');
  if (!tpl || !('content' in tpl)) return;

  function seen() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function markSeen(id) {
    try { localStorage.setItem(KEY, id); } catch (e) { /* fine */ }
  }
  function clearSeen() {
    try { localStorage.removeItem(KEY); } catch (e) { /* fine */ }
  }

  var force = null;
  try {
    var q = (new URLSearchParams(location.search).get('camppop') || '').toLowerCase();
    if (q === 'oct' || q === 'dec') { force = q; clearSeen(); }
    else if (q === 'reset') clearSeen();
  } catch (e) { /* very old browser: no test switch */ }

  function pickVariant() {
    if (force) return force;
    var now = Date.now();
    if (now < OCT_END) return 'oct';
    if (now < DEC_END) return 'dec';
    return null;
  }

  var variant = pickVariant();
  if (!variant || seen() === variant) return;
  var src = tpl.content.querySelector('[data-variant="' + variant + '"]');
  if (!src) return;

  var timeOk = false, scrollOk = false, shown = false, waiting = false;
  var card = null, lastFocus = null;

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
    return !!document.querySelector('.cup-pop:not(.is-camp)');
  }

  function close() {
    if (!card) return;
    markSeen(variant);
    document.removeEventListener('keydown', onKey);
    if (card.parentNode) card.parentNode.removeChild(card);
    card = null;
    window.__talataCampPopOpen = false;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus) && lastFocus !== document.body) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { lastFocus.focus(); }
    }
  }
  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Esc') close();
  }

  function show() {
    shown = true;
    window.removeEventListener('scroll', onScroll);
    card = src.cloneNode(true);
    window.__talataCampPopOpen = true;
    lastFocus = document.activeElement;
    document.body.appendChild(card);

    card.querySelector('.cup-x').addEventListener('click', close);
    Array.prototype.forEach.call(card.querySelectorAll('a'), function (a) {
      a.addEventListener('click', function () { markSeen(variant); });
    });
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(function () {
      if (!card) return;
      card.classList.add('is-in');
      try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }
    });
  }

  function attempt() {
    if (shown || !timeOk || !scrollOk) return;
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
    if (y >= window.innerHeight * SCROLL_SHARE) {
      scrollOk = true;
      attempt();
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();   /* a reload half way down the page already counts */
  setTimeout(function () { timeOk = true; attempt(); }, DELAY_MS);
})();
