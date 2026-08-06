/* ==========================================================================
   Talata shared header behaviour.
   - condenses the sticky bar on scroll
   - opens dropdowns on tap for touch devices (hover/focus handles the rest in CSS)
   - runs the mobile drawer: open/close, focus trap, Escape, scroll lock
   - marks the current page in both the desktop menu and the drawer
   No dependencies. Safe to load with defer.
   ========================================================================== */
(function () {
  'use strict';

  var bar = document.getElementById('tn-bar');
  var burger = document.getElementById('tn-burger');
  var drawer = document.getElementById('tn-drawer');
  var scrim = document.getElementById('tn-scrim');
  var closeBtn = document.getElementById('tn-drawer-close');

  /* ---------- condense on scroll ---------- */
  if (bar) {
    var ticking = false;
    var sync = function () {
      bar.classList.toggle('tn-scrolled', window.scrollY > 24);
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(sync); }
    }, { passive: true });
    sync();
  }

  /* ---------- current page marking ---------- */
  // Cloudflare Pages serves clean URLs, so /academy and /academy.html are the
  // same page. Normalise both sides before comparing.
  // A bare "#programs" is a jump within the current page, not a destination.
  // Returning null keeps it from matching every page at the root.
  var normalise = function (path) {
    if (!path || path.charAt(0) === '#') return null;
    path = path.split('#')[0].split('?')[0];
    if (!path) return null;
    path = path.replace(/\.html$/, '').replace(/\/index$/, '/');
    if (path.length > 1) path = path.replace(/\/$/, '');
    return path || '/';
  };
  var here = normalise(window.location.pathname) || '/';

  Array.prototype.forEach.call(document.querySelectorAll('.tn-drop a, .tn-drawer-list a'), function (a) {
    if (normalise(a.getAttribute('href')) !== here) return;
    a.setAttribute('aria-current', 'page');
    // light up the parent tab too, so /academy shows Programs as active
    var li = a.closest('li');
    var top = li && li.querySelector('.tn-top');
    if (top) top.classList.add('tn-active');
  });
  Array.prototype.forEach.call(document.querySelectorAll('.tn-top'), function (a) {
    if (normalise(a.getAttribute('href')) === here) a.setAttribute('aria-current', 'page');
  });

  /* ---------- dropdowns on touch ---------- */
  // Pointer-coarse devices get no hover, so the first tap opens instead of
  // navigating. Second tap on the same item follows the link.
  var coarse = window.matchMedia('(hover: none)');
  var closeDrops = function (except) {
    Array.prototype.forEach.call(document.querySelectorAll('.tn-drop-open'), function (li) {
      if (li === except) return;
      li.classList.remove('tn-drop-open');
      var t = li.querySelector('.tn-top');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  };

  Array.prototype.forEach.call(document.querySelectorAll('.tn-menu li'), function (li) {
    var top = li.querySelector('.tn-top');
    if (!top || !li.querySelector('.tn-drop')) return;
    top.setAttribute('aria-expanded', 'false');
    top.setAttribute('aria-haspopup', 'true');

    top.addEventListener('click', function (e) {
      if (!coarse.matches) return;
      if (li.classList.contains('tn-drop-open')) return; // second tap navigates
      e.preventDefault();
      closeDrops(li);
      li.classList.add('tn-drop-open');
      top.setAttribute('aria-expanded', 'true');
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.tn-menu')) closeDrops(null);
  });

  /* ---------- mobile drawer ---------- */
  var lastFocus = null;
  var FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

  function openDrawer() {
    if (!drawer || !scrim) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    scrim.hidden = false;
    document.documentElement.classList.add('tn-locked');
    document.body.classList.add('tn-locked');
    // next frame so the transition actually runs
    window.requestAnimationFrame(function () {
      drawer.classList.add('tn-open');
      scrim.classList.add('tn-open');
    });
    if (burger) burger.setAttribute('aria-expanded', 'true');
    var first = drawer.querySelector(FOCUSABLE);
    if (first) first.focus();
  }

  function closeDrawer() {
    if (!drawer || !scrim || drawer.hidden) return;
    drawer.classList.remove('tn-open');
    scrim.classList.remove('tn-open');
    document.documentElement.classList.remove('tn-locked');
    document.body.classList.remove('tn-locked');
    if (burger) burger.setAttribute('aria-expanded', 'false');
    var done = function () {
      drawer.hidden = true;
      scrim.hidden = true;
      drawer.removeEventListener('transitionend', done);
    };
    drawer.addEventListener('transitionend', done);
    window.setTimeout(done, 400); // fallback if the transition never fires
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (burger) burger.addEventListener('click', function () {
    drawer && drawer.hidden ? openDrawer() : closeDrawer();
  });
  if (scrim) scrim.addEventListener('click', closeDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

  // any link inside the drawer closes it (in-page anchors need this)
  if (drawer) drawer.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) closeDrawer();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (drawer && !drawer.hidden) { closeDrawer(); return; }
      closeDrops(null);
      return;
    }
    if (e.key !== 'Tab' || !drawer || drawer.hidden) return;
    var items = Array.prototype.filter.call(drawer.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null;
    });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // resizing up to desktop should not leave a drawer stranded open
  window.addEventListener('resize', function () {
    if (window.innerWidth > 900 && drawer && !drawer.hidden) closeDrawer();
  });
})();
