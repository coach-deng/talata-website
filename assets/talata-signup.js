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
  var LEADS_ENDPOINT = 'https://rhynoflow-api.coach-258.workers.dev/leads';

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
      '.tns-foot{font-size:.85rem;opacity:.75;margin:14px 0 0}'
    ].join('');
    document.head.appendChild(s);
  }

  // ─── THE PANEL ─────────────────────────────────────────────────────────────
  // `variant` picks which Holdsport team the join button points at.
  function panelHtml(variant) {
    var link = variant === 'mini' ? HOLDSPORT.mini : HOLDSPORT.intake;
    var team = variant === 'mini' ? 'Talata Mini' : 'Talata Basketball';
    return [
      '<div class="tns">',
      '<div class="tns-head"><b>Got it. You are on the list.</b>',
      '<span>Confirmation is in your inbox. Check spam if it is not there in five minutes.</span></div>',
      '<div class="tns-body">',

      '<b style="display:block;margin-bottom:8px">What happens next</b>',
      '<ol>',
      '<li><b>Deng emails you within a day</b> with your exact day, time and gym.</li>',
      '<li><b>The first session is free.</b> Turn up in trainers with a water bottle. No kit, no experience, nothing to pay.</li>',
      '<li>If it is a fit, you join the club properly. That part is below when you are ready.</li>',
      '</ol>',

      '<div class="tns-sec">',
      '<b>Already decided? Join now</b>',
      '<div class="tns-warn">',
      'Read this first, it saves a phone call:',
      '<ul>',
      '<li><b>This is the paid season membership, not the free trial.</b> Joining a team here starts your kontingent. You do not need it to come and try.</li>',
      '<li><b>Holdsport is in Danish.</b> <em>Log på</em> means log in. <em>Opret ny profil</em> means create a new profile.</li>',
      '<li><b>Create the profile in the player\'s name, not yours.</b> Parents get added to the child afterwards. This is the single most common mistake.</li>',
      '</ul>',
      '</div>',
      '<a class="tns-btn" href="' + link + '" target="_blank" rel="noopener">Join ' + team + ' on Holdsport</a>',
      '</div>',

      '<div class="tns-sec">',
      '<b>Kit, jerseys and hoodies</b>',
      '<a class="tns-btn ghost" href="' + SHOP_URL + '">Visit the Talata Shop</a>',
      '</div>',

      '<p class="tns-foot">Any question at all, just reply to the confirmation email. It comes straight to Deng.</p>',
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
  // Google Ads conversion ID. Empty until the account has a conversion action
  // created; the GA4 event below works regardless, so leave it blank rather
  // than guessing an ID. Format: 'AW-123456789/AbCdEfGhIj'.
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
      // Age, not DOB, on the public forms (Deng, Aug 10 2026). A numeric keypad
      // is two taps; a date wheel scrolled back eight years is not, and 70% of
      // traffic is mobile. The real birth DATE is captured by Holdsport at join
      // and the Aug 9 export had zero missing, so the DBBF brackets stay safe.
      // Still derive age if a form ever sends dob, so nothing breaks either way.
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
        fireConversion(data);
        form.reset();
        (opts.hide || []).concat([opts.buttonId]).forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        var host = opts.mount && document.getElementById(opts.mount);
        if (host) {
          host.innerHTML = panelHtml(opts.variant);
          host.style.display = 'block';
        } else {
          // No dedicated mount: swap the form's own contents for the panel.
          // Leaving the emptied fields on screen under the panel reads like the
          // submit failed, which is the opposite of what we want them to feel.
          Array.prototype.forEach.call(form.children, function (el) {
            el.style.display = 'none';
          });
          form.insertAdjacentHTML('beforeend', panelHtml(opts.variant));
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
