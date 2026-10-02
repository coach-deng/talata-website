/* Talata theme control (Website v3, 2 Oct 2026). Footer: "Theme: Auto / Light / Dark".

   The class itself is set before first paint by the inline script in the
   TALATA:HEAD block (tools/apply-head.py), a port of the dash's public/theme.js.
   This file only draws the footer control, stores the choice, and follows the
   phone while the choice is Auto. It loads only on pages in LIGHT_OK. */
(function () {
  var KEY = 'talata-theme';
  var root = document.documentElement;
  var mq = null;
  try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) {}

  function stored() {
    try {
      var v = window.localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch (e) { return 'auto'; }
  }

  function paint(mode) {
    var dark = mode === 'dark' || (mode === 'auto' && !!(mq && mq.matches));
    root.classList.remove('light', 'dark');
    root.classList.add(dark ? 'dark' : 'light');
    root.style.colorScheme = dark ? 'dark' : 'light';
  }

  function set(mode) {
    try {
      if (mode === 'auto') window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, mode);
    } catch (e) {}
    paint(mode);
    sync();
  }

  var buttons = [];
  function sync() {
    var mode = stored();
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', buttons[i].getAttribute('data-mode') === mode ? 'true' : 'false');
    }
  }

  function build() {
    var host = document.querySelector('.tf-base');
    if (!host || host.querySelector('.tf-theme')) return;
    var box = document.createElement('div');
    box.className = 'tf-theme';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Theme');
    var label = document.createElement('span');
    label.textContent = 'Theme';
    box.appendChild(label);
    [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-mode', m[0]);
      b.textContent = m[1];
      b.addEventListener('click', function () { set(m[0]); });
      buttons.push(b);
      box.appendChild(b);
    });
    host.appendChild(box);
    sync();
  }

  if (mq) {
    var follow = function () { if (stored() === 'auto') paint('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', follow);
    else if (mq.addListener) mq.addListener(follow);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
