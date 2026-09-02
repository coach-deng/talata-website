/**
 * TALATA SIGNUP — shared lead capture + "what happens next" panel
 *
 * One home for three things that were previously copy-pasted across five pages
 * and had drifted apart:
 *   1. The delivery path. Every form posts to the Worker ONLY. The Worker
 *      forwards to the GAS PipelineWriter. Posting to GAS directly as well
 *      (which join/mini/sparks/academy all did until Aug 10 2026) made GAS
 *      receive every submission twice, which is why parents got two
 *      confirmation emails and the sheet grew duplicate rows.
 *   2. Attribution. Paid Google vs organic Google, worked out once and kept
 *      for the whole visit.
 *   3. The success panel, including the Holdsport and jersey links.
 *
 * HOLDSPORT LINKS — verified live, logged out, Aug 10 2026:
 *   268863 = "Talata Basketball"  (the intake bucket, NOT ISH High School)
 *   318487 = "Talata Mini (U9)"
 * The token in the URL is the invite secret. Fine on a public page, not for a
 * broad blast where it gets forwarded past the intended group.
 *
 * ⚠️ Joining a team on Holdsport can trigger kontingent automatically. That is
 * why the join button only ever appears AFTER a trial request, and why the copy
 * says in plain words that the trial does not need it.
 */
(function (global) {
  'use strict';

  var HOLDSPORT = {
    intake: 'https://www.holdsport.dk/team_invitation/268863/e7bcc009a9ca4ac788e027199f540df83ee38c20',
    mini: 'https://www.holdsport.dk/team_invitation/318487/f2cdc89f63e900ca29c391d9cfbcc656ef1a8965'
  };
  // The jersey Google Form was RETIRED Aug 10 2026: it demanded a Google
  // sign-in before a parent could see a single question. The shop replaced it.
  var SHOP_URL = '/shop';
  var LEADS_ENDPOINT = 'https://talata-api.coach-258.workers.dev/leads';

  // ─── ATTRIBUTION ───────────────────────────────────────────────────────────
  // "Where did you hear about us" cannot tell paid Google from organic Google.
  // Work it out ourselves and keep it for the whole visit. Stored values still
  // contain the word "google" so any existing matching keeps working.
  var attribution = (function () {
    var KEY = 'talata_attr';
    try {
      var saved = sessionStorage.getItem(KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    var p = new URLSearchParams(location.search);
    var ref = document.referrer || '';
    var channel = '';
    if (p.get('gclid') || p.get('gbraid') || p.get('wbraid')) channel = 'google-ads';
    else if ((p.get('utm_medium') || '').match(/cpc|ppc|paid/i)) channel = (p.get('utm_source') || 'paid') + '-ads';
    else if (p.get('utm_source')) channel = p.get('utm_source');
    else if (/google\./i.test(ref)) channel = 'google-organic';
    else if (/bing\.|duckduckgo\.|ecosia\./i.test(ref)) channel = 'search-other';
    else if (/instagram\.|facebook\.|l\.instagram/i.test(ref)) channel = 'instagram';
    else if (ref && ref.indexOf(location.host) === -1) channel = 'referral';
    var attr = {
      channel: channel,
      gclid: p.get('gclid') || '',
      utm_source: p.get('utm_source') || '',
      utm_medium: p.get('utm_medium') || '',
      utm_campaign: p.get('utm_campaign') || '',
      landing: location.pathname,
      referrer: ref.slice(0, 200)
    };
    try { sessionStorage.setItem(KEY, JSON.stringify(attr)); } catch (e) {}
    return attr;
  })();

  // ─── PANEL STYLES ──────────────────────────────────────────────────────────
  var STYLE_ID = 'talata-next-steps-style';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.tns{margin-top:18px;border:1px solid #BAE6FD;border-radius:14px;overflow:hidden;',
      'background:#F8FAFC;color:#0A0A0A;font-size:.95rem;line-height:1.6;text-align:left}',
      '.tns-head{background:#0B1F3A;color:#fff;padding:14px 18px}',
      '.tns-head b{display:block;font-size:1.05rem;letter-spacing:-.01em}',
      '.tns-head span{display:block;opacity:.75;font-size:.85rem;margin-top:2px}',
      '.tns-body{padding:16px 18px}',
      '.tns ol{margin:0 0 4px;padding-left:20px}',
      '.tns ol li{margin-bottom:7px}',
      '.tns-sec{margin-top:16px;padding-top:15px;border-top:1px solid #BAE6FD}',
      '.tns-sec>b{display:block;margin-bottom:7px;font-size:.9rem;text-transform:uppercase;',
      'letter-spacing:.05em;color:#0B1F3A}',
      '.tns-btn{display:inline-block;background:#1E40AF;color:#fff;text-decoration:none;',
      'font-weight:700;padding:11px 20px;border-radius:9px;margin:2px 0 9px}',
      '.tns-btn:hover{background:#0B1F3A}',
      '.tns-btn.ghost{background:#fff;color:#1E40AF;border:1.5px solid #1E40AF}',
      '.tns-btn.ghost:hover{background:#BAE6FD}',
      '.tns-warn{background:#fff;border-left:3px solid #1E40AF;padding:10px 13px;',
      'border-radius:0 8px 8px 0;font-size:.88rem;margin-bottom:10px}',
      '.tns-warn ul{margin:6px 0 0;padding-left:18px}',
      '.tns-warn li{margin-bottom:4px}',
      '.tns em{font-style:normal;background:#BAE6FD;padding:1px 5px;border-radius:4px;font-weight:600}',
      '.tns-foot{font-size:.85rem;opacity:.75;margin:14px 0 0}',
      // The session block is the whole point of the panel, so it outranks
      // everything under it visually.
      '.tns-now{background:#0B1F3A;color:#fff;border-radius:11px;padding:14px 16px;margin-bottom:16px}',
      '.tns-now-k{display:block;font-size:.72rem;font-weight:800;letter-spacing:.14em;',
      'text-transform:uppercase;color:#7DD3FC}',
      '.tns-now-v{display:block;font-size:1.32rem;font-weight:800;letter-spacing:-.02em;margin:3px 0 5px}',
      '.tns-now-g{display:block;font-size:.92rem;font-weight:700;color:#BAE6FD}',
      '.tns-now-w{display:block;font-size:.85rem;opacity:.8;margin-top:2px}',
      '.tns-now-n{display:block;font-size:.8rem;color:#7DD3FC;margin-top:8px}',
      '.tns-alt{background:#fff;border:1px dashed #BAE6FD;border-radius:9px;',
      'padding:9px 12px;margin:-8px 0 16px;font-size:.87rem}'
    ].join('');
    document.head.appendChild(s);
  }

  // ─── THE PANEL ─────────────────────────────────────────────────────────────
  // `variant` picks which Holdsport team the join button points at.
  function sessionBlock(route) {
    if (!route || !route.when) return '';
    var alt = route.alternative && route.alternative.when
      ? '<div class="tns-alt"><b>Also open to you:</b> ' + esc(route.alternative.group) +
        ', ' + esc(route.alternative.when) + '</div>'
      : '';
    return [
      '<div class="tns-now">',
      '<span class="tns-now-k">Your first session</span>',
      '<b class="tns-now-v">' + esc(route.when) + '</b>',
      '<span class="tns-now-g">' + esc(route.group) + '</span>',
      '<span class="tns-now-w">' + esc(route.where) + '</span>',
      route.movesLater
        ? '<span class="tns-now-n">Note: this group moves 30 minutes later from Mon 24 August.</span>'
        : '',
      '</div>',
      alt
    ].join('');
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* `pending` is true when the Worker parked the signup for email verification
     (double opt-in, added 28 Aug 2026). The old copy promised a confirmation was
     already in the inbox, which stopped being true: what arrives now is a
     one-click confirm, and nothing happens at our end until it is clicked. The
     session block still shows, because the person reading this is the person who
     typed the form. */
  function panelHtml(variant, route, pending) {
    var link = variant === 'mini' ? HOLDSPORT.mini : HOLDSPORT.intake;
    var team = variant === 'mini' ? 'Talata Mini' : 'Talata Basketball';
    return [
      '<div class="tns">',
      pending
        ? '<div class="tns-head"><b>One quick thing: check your email.</b>' +
          '<span>We have sent you a link to confirm your address. Click it and you are in. ' +
          'Check spam if it is not there in five minutes.</span></div>'
        : '<div class="tns-head"><b>Got it. Come and play.</b>' +
          '<span>Confirmation is in your inbox. Check spam if it is not there in five minutes.</span></div>',
      '<div class="tns-body">',

      sessionBlock(route),

      '<b style="display:block;margin-bottom:8px">What happens next</b>',
      '<ol>',
      (pending
        ? '<li><b>Click the link in the email we just sent.</b> It takes one tap and it is how we know the address is yours.</li>'
        : ''),
      (route && route.when
        ? '<li><b>Just turn up.</b> No waiting list, nothing to book, nothing to pay. Ask for a coach at the door.</li>'
        : '<li><b>We email you within a day</b> with your exact day, time and gym.</li>'),
      '<li><b>The first session is free.</b> Trainers and a water bottle is all you need. No kit, no experience.</li>',
      '<li>If it is a fit, you join the club properly. That part is below when you are ready.</li>',
      '</ol>',

      '<div class="tns-sec">',
      '<b>Joining for the season</b>',
      '<div class="tns-warn">',
      '<b>Come to the free session first.</b> There is nothing to sign and nothing to pay to try us.',
      '<ul>',
      '<li>If it is a fit, we send you the Holdsport link afterwards and get your child on the right team.</li>',
      '<li><b>Membership starts the moment you join a team on Holdsport</b>, so we hold that back until you have actually been in the gym.</li>',
      '<li><b>Already decided?</b> Reply to your confirmation email and we will send the link today.</li>',
      '</ul>',
      '</div>',
      '</div>',

      '<div class="tns-sec">',
      '<b>Kit, jerseys and hoodies</b>',
      '<a class="tns-btn ghost" href="' + SHOP_URL + '">Visit the Talata Shop</a>',
      '</div>',

      '<p class="tns-foot">Any question at all, just reply to the confirmation email. It comes straight to us.</p>',
      '</div></div>'
    ].join('');
  }

  // ─── WIRING ────────────────────────────────────────────────────────────────
  /**
   * opts:
   *   formId      required, the <form> element id
   *   buttonId    required, the submit button id
   *   formId_     the lead source identifier written to the sheet
   *   program     fixed program label for single-program pages
   *   variant     'mini' points the join button at the Mini team
   *   programMap  optional map from an `interest` select value to a program label
   *   hide        ids to hide once the panel renders
   *   mount       id of the element to replace with the panel (defaults to after the form)
   */
  // Google Ads conversion ID. LEAVE THIS EMPTY. Deng chose the GA4 route on
  // 2 Sep 2026: Google Ads imports the `generate_lead` event below as its
  // conversion action, so no AW- tag is needed and none is installed. The site
  // carries GA4 (G-R64Y9CQ2VZ) on all 54 pages and no Ads tag, so filling this
  // in would fire a conversion event at a tag that is not on the page and
  // record nothing. If the Ads/GA4 link is ever dropped, install the Ads global
  // tag in tools/apply-shared-header.py FIRST, then set this.
  var ADS_SEND_TO = '';

  // What a lead is worth to the club, so Ads can bid toward the valuable ones
  // instead of treating a Mini trial and an Academy trial as the same thing.
  // Half-season fee from programs.md, x2 for a full year, discounted for the
  // share of trials that never convert to a paid member.
  var LEAD_VALUE = {
    'Talata Mini': 1800, 'Talata Junior': 1800, 'Talata Sparks': 1800,
    'Talata Academy': 3300, 'Talata Men': 2000, 'Free trial': 2200
  };

  function leadValue(data) {
    var age = parseInt(data.age, 10);
    if (age >= 5 && age <= 8) return LEAD_VALUE['Talata Mini'];
    if (age >= 9 && age <= 11) return LEAD_VALUE['Talata Junior'];
    if (age >= 12 && age <= 19) return LEAD_VALUE['Talata Academy'];
    if (age >= 20) return LEAD_VALUE['Talata Men'];
    return LEAD_VALUE[data.program] || LEAD_VALUE['Free trial'];
  }

  // Fire once, on a confirmed 2xx from the Worker. Firing on click instead
  // would count every fat-fingered submit as a signup and quietly poison the
  // bidding data, which is worse than having no data at all.
  function fireConversion(data) {
    if (typeof window.gtag !== 'function') return;
    var value = leadValue(data);
    try {
      window.gtag('event', 'generate_lead', {
        currency: 'DKK',
        value: value,
        program: data.program || 'Free trial',
        age: data.age || '',
        form_id: data.form_id || '',
        source: data.source || ''
      });
      if (ADS_SEND_TO) {
        window.gtag('event', 'conversion', {
          send_to: ADS_SEND_TO,
          value: value,
          currency: 'DKK'
        });
      }
    } catch (err) { /* never let analytics break the confirmation panel */ }
  }

  function wire(opts) {
    var form = document.getElementById(opts.formId);
    var btn = document.getElementById(opts.buttonId);
    if (!form || !btn) return;
    injectStyles();

    // A date input with no max happily accepts a birth date in 2087. Pin it to
    // today on every load rather than hardcoding a date that goes stale.
    var dobEl = form.querySelector('input[name="dob"]');
    if (dobEl) dobEl.max = new Date().toISOString().slice(0, 10);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var label = btn.textContent;
      btn.textContent = 'Sending...';
      btn.disabled = true;

      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });

      // Canonical lead schema. Every page sends the same field names so the
      // pipeline stops guessing.
      data.player_name = data.player_name || data.child_name || '';
      data.name = data.player_name;
      // DOB on the public forms, reversing the Aug 10 call (Deng, 18 Aug 2026).
      //
      // The Aug 10 reasoning was real — a numeric keypad is two taps, a date
      // wheel is not, and 70% of traffic is mobile — but it assumed Holdsport
      // would supply the birth date later. Routing happens BEFORE Holdsport, in
      // the confirmation email, so it never saw one.
      //
      // And age cannot do this job. DBBF brackets run off age on 1 OCTOBER, so
      // a player turning 17 after the cutoff is still U17. Born Nov 2011 you
      // are U15, born Mar 2011 you are U17 — same age today, different team.
      // Not even a birth year separates those two. Only the date does.
      //
      // age is still derived and still sent, so every downstream consumer that
      // reads `age` keeps working untouched.
      if (data.dob) {
        var b = new Date(data.dob);
        if (!isNaN(b.getTime())) {
          var n = new Date();
          var a = n.getFullYear() - b.getFullYear();
          var m = n.getMonth() - b.getMonth();
          if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
          data.age = String(a);
        }
      }
      // The homepage select is name="interest", the /join select is
      // name="program". Only "interest" was ever checked, so every lead from
      // /join came through labelled "Free trial" no matter what the parent
      // picked, including the adults who chose Talata Men. Check both, and if
      // the value is not in the map keep the raw choice rather than throwing
      // it away, because a slightly ugly label beats a wrong one.
      var picked = data.interest || data.program;
      data.program = opts.program
        || (opts.programMap && opts.programMap[picked])
        || picked
        || 'Free trial';
      data.camp = data.program;
      data.form_id = opts.formId_ || 'talata-web';
      data.campaign = opts.formId_ || 'talata-web';

      data.source = data.how_found || opts.formId_ || 'talata-web';
      if (data.source === 'google' && attribution.channel.indexOf('google') === 0) {
        data.source = attribution.channel;
      }
      data.attribution = attribution.channel || 'direct';
      data.gclid = attribution.gclid;
      data.utm_source = attribution.utm_source;
      data.utm_medium = attribution.utm_medium;
      data.utm_campaign = attribution.utm_campaign;
      data.landing_page = attribution.landing;
      data.referrer = attribution.referrer;

      // Fold the extra routing answers into the note Deng actually reads.
      // The separate "how much basketball have they played" select was removed
      // Aug 10 2026: parents were already writing it into the free-text box
      // unprompted, so it was a field cost for information we already had.
      var extra = [];
      if (data.wants_team) extra.push('Looking for: ' + data.wants_team);
      if (extra.length) {
        data.message = (data.message ? data.message + ' | ' : '') + extra.join(' | ');
      }

      // Single delivery path. The Worker stores the lead and forwards to GAS.
      // Do NOT also post to GAS here, that is what doubled every email.
      fetch(LEADS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (res) {
        if (!res.ok) throw new Error('lead rejected');
        return res.json().catch(function () { return {}; });
      }).then(function (out) {
        var route = (out && out.route) || null;
        var pending = !!(out && out.pending);
        fireConversion(data);
        form.reset();
        (opts.hide || []).concat([opts.buttonId]).forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        var host = opts.mount && document.getElementById(opts.mount);
        if (host) {
          host.innerHTML = panelHtml(opts.variant, route, pending);
          host.style.display = 'block';
        } else {
          // No dedicated mount: swap the form's own contents for the panel.
          // Leaving the emptied fields on screen under the panel reads like the
          // submit failed, which is the opposite of what we want them to feel.
          Array.prototype.forEach.call(form.children, function (el) {
            el.style.display = 'none';
          });
          form.insertAdjacentHTML('beforeend', panelHtml(opts.variant, route, pending));
        }
        var panel = (host || form).querySelector('.tns');
        if (panel && panel.scrollIntoView) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }).catch(function () {
        btn.textContent = label;
        btn.disabled = false;
        alert('Something went wrong. Email coach@talatabasketball.dk and we sort it.');
      });
    });
  }

  global.TalataSignup = { wire: wire, attribution: attribution, HOLDSPORT: HOLDSPORT, SHOP_URL: SHOP_URL };
})(window);
