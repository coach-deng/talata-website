/* Talata cookie consent (Website v3, 2 Oct 2026).
 *
 * Google Analytics sets cookies, and in Denmark that needs a yes first. Every page
 * head now carries only a gtag stub with Consent Mode v2 set to "denied" (written by
 * tools/apply-consent.py). Nothing from Google loads until a visitor taps Accept.
 *   - Accept: consent update to granted, then gtag.js loads and config runs.
 *   - Decline: stored, nothing loads, nothing is asked again for six months.
 * Both buttons look the same: refusing has to be as easy as accepting.
 * The footer link "Cookie settings" ([data-cookie-settings]) opens the banner again.
 * Events from talata-track.js and talata-signup.js queue in dataLayer either way;
 * they only reach Google after Accept.
 */
(function () {
  'use strict';
  var GA_ID = 'G-R64Y9CQ2VZ';
  var KEY = 'talata-consent';
  var MAX_AGE_DAYS = 182;
  var loaded = false;

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!v || !v.at || (v.choice !== 'granted' && v.choice !== 'denied')) return null;
      if ((Date.now() - Date.parse(v.at)) / 864e5 > MAX_AGE_DAYS) return null;
      return v.choice;
    } catch (e) {
      return null;
    }
  }

  function save(choice) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ choice: choice, at: new Date().toISOString() }));
    } catch (e) { /* private mode: the choice holds for this page only */ }
  }

  function gtag() { (window.dataLayer = window.dataLayer || []).push(arguments); }

  function grant() {
    gtag('consent', 'update', {
      analytics_storage: 'granted', ad_storage: 'granted',
      ad_user_data: 'granted', ad_personalization: 'granted'
    });
    if (loaded) return;
    loaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    gtag('config', GA_ID);
  }

  function close(box) {
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }

  function open() {
    var old = document.getElementById('tc-consent');
    if (old) return old.querySelector('button').focus();
    var box = document.createElement('div');
    box.id = 'tc-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-label', 'Cookies');
    box.innerHTML =
      '<p>We would like to use Google Analytics to see which pages help families find us. ' +
      'It sets cookies, so it only runs if you say yes. <a href="/privacy">Privacy</a></p>' +
      '<div class="tc-btns"><button type="button" data-c="denied">Decline</button>' +
      '<button type="button" data-c="granted">Accept</button></div>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-c]') : null;
      if (!b) return;
      var choice = b.getAttribute('data-c');
      save(choice);
      if (choice === 'granted') grant();
      close(box);
    });
    document.body.appendChild(box);
  }

  var css =
    '#tc-consent{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;' +
    'background:var(--td-surface,#1b2333);color:var(--td-text,#F8FAFC);border:1px solid var(--td-border,rgba(248,250,252,.14));' +
    'border-radius:16px;padding:16px 16px 14px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:15px/1.45 Inter,system-ui,sans-serif}' +
    '#tc-consent p{margin:0 0 12px}#tc-consent a{color:var(--td-link,#7DD3FC)}' +
    '#tc-consent .tc-btns{display:flex;gap:10px}' +
    '#tc-consent button{flex:1;min-height:44px;border-radius:999px;font:600 15px Inter,system-ui,sans-serif;cursor:pointer;' +
    'background:transparent;color:inherit;border:1.5px solid var(--td-link,#7DD3FC)}' +
    '#tc-consent button:focus-visible{outline:2px solid var(--td-link,#7DD3FC);outline-offset:2px}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var choice = read();
  if (choice === 'granted') grant();

  function ready() {
    if (choice === null) open();
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('[data-cookie-settings]') : null;
      if (!a) return;
      e.preventDefault();
      open();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

  window.TalataConsent = { open: open, choice: function () { return read(); } };
})();
