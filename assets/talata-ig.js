/* Latest from Instagram (Website v3, 2 Oct 2026).
 *
 * Fills the homepage "Watch Talata" grid ([data-talata-ig]) with the club's newest
 * posts from the Worker: GET /ig/latest gives the permalink, type and date, and
 * GET /ig/img/:id gives the picture, fetched by the Worker, so the visitor's
 * browser never contacts Meta (no cookies, no consent needed). No captions and no
 * counts ever come back. With fewer than three posts, or any error, the three
 * static cards already on the page stay.
 */
(function () {
  'use strict';
  var grid = document.querySelector('[data-talata-ig]');
  if (!grid || !window.fetch) return;
  var API = 'https://talata-api.coach-258.workers.dev';
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function when(iso) {
    var d = new Date(iso || '');
    return isNaN(d) ? '' : d.getUTCDate() + ' ' + MON[d.getUTCMonth()];
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  fetch(API + '/ig/latest?n=6')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var posts = (d && d.posts || []).filter(function (p) { return /^https:\/\/www\.instagram\.com\//.test(p.url || ''); });
      if (posts.length < 3) return;
      grid.innerHTML = posts.map(function (p) {
        var moving = p.kind === 'reel' || p.kind === 'video';
        var date = when(p.posted_at);
        return '<a class="wcard ig" href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
          '<img src="' + API + esc(p.img) + '" alt="Talata Instagram ' + (moving ? 'reel' : 'post') + (date ? ', ' + esc(date) : '') +
          '" decoding="async" loading="lazy">' +
          (moving ? '<div class="play"><i><svg viewBox="0 0 12 14" aria-hidden="true"><path d="M0 0l12 7-12 7z"/></svg></i></div>' : '') +
          '<div class="cap">' + (moving ? 'Reel' : 'Post') + (date ? ' &middot; ' + esc(date) : '') + '</div></a>';
      }).join('');
      grid.classList.add('ig-live');
    })
    .catch(function () { /* the static cards stay */ });
})();
