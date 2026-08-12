/**
 * TALATA SHOP — catalogue, cart, MobilePay checkout
 *
 * Replaces the Google Form that demanded a Google sign-in before a parent could
 * see a single question. No login here, no card processor.
 *
 * PAYMENT RAIL — do not change without reading this.
 *   Merch pays to MobilePay **52697**, the club/forening rail.
 *   NEVER 767375: that is Rhynoflow, a different CVR, and routing merch there
 *   would break the momsloven § 13 stk. 1 nr. 21 reasoning that keeps member
 *   deliveries outside erhvervsmæssig indkomst.
 *   NEVER 767373: typo, wrong merchant.
 *
 * ⚠️ MOMS THRESHOLD. Registration becomes compulsory above **50,000 kr across a
 * rolling 12 months** (momsloven § 48 stk. 1). At these prices that is roughly
 * 150 to 250 items. The order feed is the only place this becomes visible, so
 * check the running total with Ashfaq before volume builds.
 *
 * PRICES ARE FROM SecondBrain/Talata/programs.md § Talata Shop. If the two
 * disagree, programs.md wins and this file is what needs changing.
 */
(function (global) {
  'use strict';

  var MOBILEPAY = '52697';
  // Orders go to /orders, NOT /leads. Posting them to /leads made GAS send the
  // trial-lead auto-reply ("Deng replies within a day with your training time")
  // to someone who had just bought a hoodie. Caught Aug 10 2026 on a real order.
  var ORDERS_ENDPOINT = 'https://talata-api.coach-258.workers.dev/orders';
  var CART_KEY = 'talata_cart_v1';

  var SIZES_APPAREL = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  var SIZES_KIDS = ['6-8y', '8-10y', '10-12y', '12-14y', 'XS', 'S', 'M', 'L', 'XL'];
  var SIZES_SOCK = ['31-34', '35-38', '39-42', '43-46'];

  // stock (Deng, Aug 10 2026 — NOTHING is on the shelf right now):
  //   'made' = made to order, goes in the next batch
  //   'soon' = stock is ordered and on its way in
  // There is deliberately no 'in' state. Re-add one only when a box actually
  // lands, because "In stock" on a card is a delivery promise to a parent.
  // PHOTOS (added 11 Aug 2026). These are ACTION AND TEAM SHOTS, not studio
  // product shots — we do not own a single photo of the hoodie, pants, crewneck
  // or socks on their own. Assigned honestly: a card only gets a photo that
  // genuinely shows that garment, or a club/team shot used as lookbook imagery.
  // A jersey photo on a hoodie card would sell a parent something they did not
  // see, and that comes back as a return. The strip at the top of shop.html
  // tells buyers these are the kit in action and real product shots follow.
  // NO PHOTOS ON CARDS — decided 11 Aug 2026, and this is deliberate.
  //
  // Deng's rule was: only show a photo where you can clearly see one player
  // wearing that item. Applied honestly that left FOUR cards with images and
  // ELEVEN bare, because we own game-action shots and nothing else. A grid
  // that is a quarter illustrated does not read as restraint, it reads as a
  // half-finished website, and that costs more trust than it buys.
  //
  // So the cards are uniform and text-only, and the four good action shots
  // moved to a lookbook strip at the top of shop.html where they sell the club
  // without pretending to be product photography.
  //
  // When real garment shots exist, put them on EVERY card at once. Do not
  // reintroduce a partial set.
  var CATALOGUE = [
    { id: 'socks',      name: 'Talata socks',            member: 75,  pub: 95,  sizes: SIZES_SOCK,    stock: 'made', cat: 'basics' },
    { id: 'socks3',     name: 'Talata socks, 3 pack',    member: 175, pub: 225, sizes: SIZES_SOCK,    stock: 'made', cat: 'basics' },
    { id: 'cap',        name: 'Talata cap',              member: 130, pub: 160, sizes: ['One size'],  stock: 'made', cat: 'basics' },
    { id: 'tee',        name: 'Talata t-shirt',          member: 149, pub: 189, sizes: SIZES_KIDS,    stock: 'soon', cat: 'basics' },
    // Crewneck was not called out either way on Aug 10. Grouped with the other
    // apparel as incoming; move it to 'made' if that is wrong.
    { id: 'crew',       name: 'Crewneck sweatshirt',     member: 279, pub: 349, sizes: SIZES_KIDS,    stock: 'soon', cat: 'apparel' },
    { id: 'hoodie',     name: 'Hoodie',                  member: 379, pub: 469, sizes: SIZES_KIDS,    stock: 'soon', cat: 'apparel' },
    { id: 'hoodieheavy',name: 'Heavy hoodie',            member: 479, pub: 589, sizes: SIZES_APPAREL, stock: 'soon', cat: 'apparel' },
    { id: 'pants',      name: 'Sweatpants',              member: 349, pub: 429, sizes: SIZES_KIDS,    stock: 'soon', cat: 'apparel' },
    { id: 'jersey',     name: 'Game jersey',             member: 299, pub: 369, sizes: SIZES_KIDS,    stock: 'soon', cat: 'jersey',  kit: true },
    { id: 'jerseyname', name: 'Game jersey, name + number', member: 379, pub: 449, sizes: SIZES_KIDS, stock: 'soon', cat: 'jersey',  kit: true, personalise: true },
  ];

  // BUNDLE PRICING — REBUILT 11 Aug 2026 on Deng's instruction (Game Pack at 799).
  //
  // The old rule was "every bundle sits 9-17% off its parts". That is dead. The
  // ladder now ESCALATES with basket size, which is standard kit-package retail
  // (Epic Sports and similar advertise 20-40% off uniform packages) and makes
  // the Game Pack the obvious hero rather than one option among five.
  //
  //   bundle        member   parts   off      public   parts   off
  //   Starter          189     224   16%         239     284   16%
  //   Game Day         319     374   15%         399     464   14%
  //   Practice         449     573   22%         559     713   22%
  //   Full Talata      649     952   32%         819   1,182   31%
  //   Game Pack        799   1,326   40%         999   1,636   39%
  //
  // Full Talata HAD to move. At the old 799 it would have cost the same as the
  // Game Pack while containing 374 kr less member value, so nobody would ever
  // have bought it. 649 keeps the upsell honest: 150 kr more swaps tee+socks
  // for two match jerseys.
  //
  // ⚠️ HISTORY, READ BEFORE CHANGING AGAIN. b_gamepack was set to 800 on
  // Aug 10 2026 and Deng reversed it the same day because ~40% off was double
  // the discount on everything else. Deng re-instructed 799 on Aug 11 with the
  // rest of the ladder rebuilt around it, which resolves that inconsistency.
  //
  // ✅ COST BASELINE (Deng, 11 Aug 2026): a full set — home kit + away kit,
  // hoodie and pants — lands at roughly 650 kr. That is the first real cost
  // number we have had, and it settles the open margin question:
  //
  //   Game Pack   member 799  − 650 cost = +149  (19% margin)
  //   Game Pack   public 999  − 650 cost = +349  (35% margin)
  //
  // So 799 clears cost, but only just on the member side. Every Game Pack sold
  // to a member earns about 149 kr. That is fine as a flagship, and it is thin
  // enough that it should not be discounted again without a new cost number.
  // Still worth getting Emma's per-item breakdown so the singles can be checked
  // the same way.
  //
  // ⚠️ SOCKS ARE OUT OF THE FULL TALATA BUNDLE (Deng, 11 Aug): we do not have
  // stock and will not sell a bundle we cannot ship. Socks stay in Starter,
  // Game Day and Practice for now, and go back into Full Talata later.
  // UNIT COSTS — corrected 11 Aug 2026, second pass.
  //
  // Deng's 650 kr set is SIX pieces: home kit (jersey + shorts), away kit
  // (jersey + shorts), hoodie, pants. The first model assumed four pieces and
  // therefore overstated every unit cost by ~35%. Split across six on standard
  // teamwear ratios:
  //   hoodie 144 · pants 122 · crew 115 · jersey 105 · shorts 87
  //   heavy hoodie 176 · tee 48 · cap 40 · socks 22
  // Still modelled, not quoted. Emma's real breakdown would settle it.
  //
  // WHY 799 STAYS. It is not a margin decision, it is a promise. 800 is what
  // members paid last season and they expect the same deal this season. Break
  // it and you save 149 kr a pack and spend the goodwill of every returning
  // family. Keep it, and fund it from the public price instead — non-members
  // never had that promise. Public goes 999 -> 1,099, still well under the
  // 1,349 it launched at, and the 300 kr gap becomes a real reason to join.
  //
  //   bundle        cost   member  margin       public  margin
  //   Starter         70      189   +119 63%       239   +169 71%
  //   Game Day       127      319   +192 60%       399   +272 68%
  //   Practice       192      479   +287 60%       599   +407 68%
  //   Full Talata    314      699   +385 55%       879   +565 64%
  //   Game Pack      650      799   +149 19%     1,099   +449 41%
  //
  // The other four came DOWN from the last pass (199/339/509/769). With the
  // corrected costs they were carrying 60%+ margins while looking expensive
  // next to the Game Pack. Now they read as an honest 15-20% bundle discount
  // and still clear 55-63%. Blended across the shop that is a healthy book.
  //
  // ⚠️ Full Talata is still structurally dominated by the Game Pack and always
  // will be while 799 buys six pieces. Its real audience is the parent or
  // sibling who wants club wear and no jersey. Priced for that, not for volume.
  var BUNDLES = [
    { id: 'b_starter',  name: 'Starter bundle',   desc: 'Tee + socks',                     member: 189,  pub: 239,  stock: 'soon', cat: 'bundle' },
    { id: 'b_gameday',  name: 'Game Day bundle',  desc: 'Jersey + socks',                  member: 319,  pub: 399,  stock: 'soon', cat: 'bundle', kit: true },
    { id: 'b_practice', name: 'Practice bundle',  desc: 'Tee + pants + socks',             member: 479,  pub: 599,  stock: 'soon', cat: 'bundle' },
    { id: 'b_full',     name: 'Full Talata',      desc: 'Hoodie + pants + tee',            member: 699,  pub: 879,  stock: 'soon', cat: 'bundle' },
    // Shorts were missing from this description. The pack has always included
    // them — it is two complete kits — and leaving them out undersold it badly.
    { id: 'b_gamepack', name: 'Game Pack',        desc: 'Home + away kit, hoodie + pants', member: 799, pub: 1099, stock: 'soon', cat: 'bundle', bothKits: true },
  ];

  var ALL = CATALOGUE.concat(BUNDLES.map(function (b) {
    return Object.assign({ sizes: SIZES_KIDS }, b);
  }));

  function byId(id) {
    for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i];
    return null;
  }

  // ─── CART ────────────────────────────────────────────────────────────────
  var cart = [];
  var isMember = false;

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
      cart = Array.isArray(raw.items) ? raw.items : [];
      isMember = !!raw.member;
    } catch (e) { cart = []; }
  }
  function save() {
    try { localStorage.setItem(CART_KEY, JSON.stringify({ items: cart, member: isMember })); } catch (e) {}
  }
  function priceOf(item) {
    var p = byId(item.id);
    return p ? (isMember ? p.member : p.pub) : 0;
  }
  function total() {
    return cart.reduce(function (s, it) { return s + priceOf(it) * it.qty; }, 0);
  }
  function count() {
    return cart.reduce(function (s, it) { return s + it.qty; }, 0);
  }
  function add(id, size, kit, name, number) {
    var key = [id, size, kit || '', name || '', number || ''].join('|');
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].key === key) { cart[i].qty++; save(); return; }
    }
    cart.push({ key: key, id: id, size: size, kit: kit || '', name: name || '', number: number || '', qty: 1 });
    save();
  }
  function setQty(key, qty) {
    cart = cart.filter(function (it) {
      if (it.key !== key) return true;
      it.qty = qty;
      return qty > 0;
    });
    save();
  }
  function reference() {
    // Short, human-readable, easy to type into a MobilePay message field.
    var d = new Date();
    var stamp = String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    var rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'TAL-' + stamp + '-' + rand;
  }

  // ─── ORDER SUBMIT ────────────────────────────────────────────────────────
  function submitOrder(buyer, cb) {
    var ref = reference();
    var lines = cart.map(function (it) {
      var p = byId(it.id);
      var bits = [it.qty + ' x ' + p.name, it.size];
      if (it.kit) bits.push(it.kit);
      if (it.name) bits.push('name: ' + it.name);
      if (it.number) bits.push('no: ' + it.number);
      bits.push(priceOf(it) * it.qty + ' kr');
      return bits.join(' | ');
    });

    var payload = {
      // The Worker requires name + email on /orders.
      name: buyer.buyer_name,
      buyer_name: buyer.buyer_name,
      email: buyer.email,
      player_name: buyer.player_name || buyer.buyer_name,
      phone: buyer.phone,
      program: 'Talata Shop order',
      form_id: 'talata-shop-2026',
      type: 'shop',
      source: 'shop',
      order_ref: ref,
      order_total: total(),
      order_member: isMember ? 'yes' : 'no',
      order_lines: lines,
      message:
        'SHOP ORDER ' + ref + ' | ' + (isMember ? 'MEMBER' : 'public') + ' | total ' +
        total() + ' kr | MobilePay ' + MOBILEPAY + '\n' + lines.join('\n') +
        (buyer.note ? '\nNote: ' + buyer.note : '')
    };

    fetch(ORDERS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('order rejected');
      // Revenue signal for GA4/Ads. Fires on a confirmed order, not on
      // "add to cart", so the number matches what actually hits MobilePay.
      if (typeof window.gtag === 'function') {
        try {
          window.gtag('event', 'purchase', {
            transaction_id: ref,
            currency: 'DKK',
            value: total()
          });
        } catch (err) { /* analytics must never block the MobilePay panel */ }
      }
      cb(null, { ref: ref, total: total(), lines: lines });
      cart = []; save();
    }).catch(function (e) { cb(e); });
  }

  load();

  global.TalataShop = {
    CATALOGUE: CATALOGUE,
    BUNDLES: BUNDLES,
    ALL: ALL,
    MOBILEPAY: MOBILEPAY,
    byId: byId,
    get cart() { return cart; },
    get isMember() { return isMember; },
    setMember: function (v) { isMember = !!v; save(); },
    priceOf: priceOf,
    total: total,
    count: count,
    add: add,
    setQty: setQty,
    submitOrder: submitOrder
  };
})(window);
