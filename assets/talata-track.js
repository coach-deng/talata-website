/* ==========================================================================
   Talata click tracking.

   GA4 (G-R64Y9CQ2VZ) is already on every page but has only ever recorded page
   views, so we know how many people landed and how many signed up, and nothing
   about what happened in between. This fills that gap.

   No Cloudflare Worker needed. The Worker stores leads and orders; it is the
   wrong tool for behaviour, because it only ever hears from people who already
   converted. Everything here rides the gtag that is already loaded.

   Deliberately NOT tracked here:
     - form submits: assets/talata-signup.js already fires generate_lead
     - shop orders:  assets/talata-shop.js already fires purchase
   Re-firing those would double-count conversions and poison Ads bidding.

   One delegated listener on document. No dependencies. Safe to defer.
   ========================================================================== */
(function () {
  'use strict';

  if (typeof window.gtag !== 'function') return;

  var HOST = window.location.hostname;
  var page = window.location.pathname.replace(/\/index\.html$/, '/') || '/';

  function send(name, params) {
    try {
      params = params || {};
      params.page_path = page;
      window.gtag('event', name, params);
    } catch (err) { /* never let tracking break a click */ }
  }

  // Readable label for a clicked element. Prefers an explicit data-track,
  // then the visible text, then an aria-label. Trimmed because GA4 truncates
  // parameter values at 100 chars and a truncated label is unreadable.
  function labelFor(el) {
    var explicit = el.getAttribute('data-track');
    if (explicit) return explicit.slice(0, 90);
    var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 90);
    return (el.getAttribute('aria-label') || 'unlabelled').slice(0, 90);
  }

  function isExternal(href) {
    if (!href) return false;
    if (href.charAt(0) === '/' || href.charAt(0) === '#') return false;
    var m = href.match(/^https?:\/\/([^\/]+)/i);
    return !!m && m[1].replace(/^www\./, '') !== HOST.replace(/^www\./, '');
  }

  /* ---------- clicks ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a, button');
    if (!a) return;

    var href = a.getAttribute('href') || '';
    var label = labelFor(a);

    // Contact intents. These are conversions in their own right: somebody who
    // WhatsApps Deng is worth as much as somebody who fills the form, and until
    // now they were completely invisible.
    if (/^mailto:/i.test(href))  return send('contact_click', { method: 'email',    label: label });
    if (/^tel:/i.test(href))     return send('contact_click', { method: 'phone',    label: label });
    if (/wa\.me|whatsapp/i.test(href)) return send('contact_click', { method: 'whatsapp', label: label });

    // Holdsport is where a trial becomes a paying member, and it is off-site,
    // so without this the funnel goes dark at exactly the moment money starts.
    if (/holdsport/i.test(href)) {
      return send('holdsport_click', { label: label, destination: href.slice(0, 100) });
    }

    if (isExternal(href)) {
      return send('outbound_click', { label: label, destination: href.slice(0, 100) });
    }

    // Internal CTAs. Tells us which button on which page actually starts a
    // signup, which is the thing the owner has never been able to see.
    var isCta = a.matches('.btn, .go, .nav-cta, .tn-cta, .cta a, [data-cta], .submit-btn, button[type=submit]');
    if (isCta) {
      send('cta_click', { label: label, destination: href.slice(0, 100) || 'submit' });
    }
  }, true);

  /* ---------- form engagement ---------- */
  // Fires once per form, on first interaction. Pairing form_start against
  // generate_lead gives the abandonment rate: how many people begin a signup
  // and walk away. That number is the difference between "nobody visits" and
  // "the form is asking too much", and those need opposite fixes.
  var started = {};
  document.addEventListener('focusin', function (e) {
    var field = e.target;
    if (!field.matches || !field.matches('input, select, textarea')) return;
    var form = field.closest('form');
    if (!form) return;
    var id = form.id || 'unnamed-form';
    if (started[id]) return;
    started[id] = true;
    send('form_start', { form_id: id });
  }, true);

  /* ---------- reading depth ---------- */
  // Only on long pages that are meant to be read. A parent who reaches the
  // bottom of the Copenhagen guide and does not click is a copy problem;
  // one who never gets past the fold is a different problem entirely.
  if (document.body.scrollHeight > window.innerHeight * 2.5) {
    var marks = [25, 50, 75, 100];
    var hit = {};
    var onScroll = function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) return;
      var pct = Math.min(100, Math.round((window.scrollY / h) * 100));
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        if (pct >= m && !hit[m]) {
          hit[m] = true;
          send('scroll_depth', { percent: m });
        }
      }
      if (hit[100]) window.removeEventListener('scroll', onScroll);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }
})();
