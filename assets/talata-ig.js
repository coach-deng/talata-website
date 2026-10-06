/* Latest from Instagram (Website v3, 2 Oct 2026; club only from 6 Oct 2026).
 *
 * Fills the homepage "Watch Talata" grid ([data-talata-ig]) with the club's newest
 * posts from the Worker: GET /ig/latest gives the permalink, type and date, and
 * GET /ig/img/:id gives the picture, fetched by the Worker, so the visitor's
 * browser never contacts Meta (no cookies, no consent needed). No captions and no
 * counts ever come back.
 *
 * Club only (Deng, 6 Oct 2026). The grid showed @coachdeng reels because the
 * Worker's token is Deng's own account. The feed is now used only when the JSON
 * says account === "talatabasketball" and every permalink is an instagram.com
 * URL. Until the Worker sends that, the three static club cards stay.
 *
 * Preload: each tile is loaded with new Image() first. The grid swaps only when
 * at least 3 pictures have loaded (4s budget). Broken tiles are dropped, and the
 * static cards come back if fewer than 3 remain.
 */
(function () {
  'use strict';
  var grid = document.querySelector('[data-talata-ig]');
  if (!grid || !window.fetch) return;
  var API = 'https://talata-api.coach-258.workers.dev';
  var ACCOUNT = 'talatabasketball';
  var MIN = 3;
  var WAIT = 4000;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var IG_URL = /^https:\/\/(www\.)?instagram\.com\//;
  var staticCards = grid.innerHTML;

  // Copenhagen date, "28 Sep". Numeric parts only, so no locale ever turns
  // September into "Sept".
  var fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'numeric' });
    if (!fmt.formatToParts) fmt = null;
  } catch (e) { fmt = null; }
  function when(iso) {
    var d = new Date(iso || '');
    if (isNaN(d)) return '';
    if (fmt) {
      var day = '', mon = '';
      fmt.formatToParts(d).forEach(function (p) {
        if (p.type === 'day') day = p.value;
        if (p.type === 'month') mon = MON[+p.value - 1] || '';
      });
      if (day && mon) return day + ' ' + mon;
    }
    return d.getUTCDate() + ' ' + MON[d.getUTCMonth()];
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function clubFeed(d) {
    if (!d || String(d.account || '').toLowerCase() !== ACCOUNT) return [];
    var posts = d.posts || [];
    var allIg = posts.every(function (p) { return p && IG_URL.test(p.url || ''); });
    if (!allIg) return [];
    return posts.filter(function (p) { return /^\/[^\/]/.test(p.img || ''); }).slice(0, 6);
  }

  function tile(p) {
    var moving = p.kind === 'reel' || p.kind === 'video';
    var label = moving ? 'Reel' : 'Post';
    var date = when(p.posted_at);
    return '<a class="wcard ig" href="' + esc(p.url) + '" target="_blank" rel="noopener" data-track="ig-tile">' +
      '<img src="' + API + esc(p.img) + '" alt="Talata Instagram ' + label.toLowerCase() + (date ? ', ' + esc(date) : '') +
      '" width="540" height="960" decoding="async">' +
      '<div class="cap">' + label + (date ? ' &middot; ' + esc(date) : '') + '</div></a>';
  }

  function restore() {
    grid.classList.remove('ig-live');
    grid.innerHTML = staticCards;
  }

  function show(posts) {
    grid.innerHTML = posts.map(tile).join('');
    grid.classList.add('ig-live');
    Array.prototype.forEach.call(grid.querySelectorAll('.wcard.ig img'), function (img) {
      img.addEventListener('error', function () {
        var a = img.closest('.wcard');
        if (a) a.remove();
        if (grid.querySelectorAll('.wcard.ig').length < MIN) restore();
      });
    });
    var reveal = function () {
      Array.prototype.forEach.call(grid.querySelectorAll('.wcard.ig'), function (a) { a.classList.add('is-loaded'); });
    };
    if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(reveal); });
    else reveal();
  }

  function preload(posts) {
    var ok = posts.map(function () { return false; });
    var left = posts.length;
    var done = false;
    function settle() {
      if (done) return;
      done = true;
      var good = posts.filter(function (p, i) { return ok[i]; });
      if (good.length >= MIN) show(good);
    }
    var timer = setTimeout(settle, WAIT);
    posts.forEach(function (p, i) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () { ok[i] = true; if (--left === 0) { clearTimeout(timer); settle(); } };
      im.onerror = function () { if (--left === 0) { clearTimeout(timer); settle(); } };
      im.src = API + p.img;
    });
  }

  fetch(API + '/ig/latest?n=6')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var posts = clubFeed(d);
      if (posts.length >= MIN) preload(posts);
    })
    .catch(function () { /* the static cards stay */ });
})();
