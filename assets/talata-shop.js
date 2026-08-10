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
  var ORDERS_ENDPOINT = 'https://rhynoflow-api.coach-258.workers.dev/orders';
  var CART_KEY = 'talata_cart_v1';

  var SIZES_APPAREL = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  var SIZES_KIDS = ['6-8y', '8-10y', '10-12y', '12-14y', 'XS', 'S', 'M', 'L', 'XL'];
  var SIZES_SOCK = ['31-34', '35-38', '39-42', '43-46'];

  // stock (Deng, Aug 10 2026 — NOTHING is on the shelf right now):
  //   'made' = made to order, goes in the next batch
  //   'soon' = stock is ordered and on its way in
  // There is deliberately no 'in' state. Re-add one only when a box actually
  // lands, because "In stock" on a card is a delivery promise to a parent.
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
    { id: 'jersey',     name: 'Game jersey',             member: 299, pub: 369, sizes: SIZES_KIDS,    stock: 'soon', cat: 'jersey', kit: true },
    { id: 'jerseyname', name: 'Game jersey, name + number', member: 379, pub: 449, sizes: SIZES_KIDS, stock: 'soon', cat: 'jersey', kit: true, personalise: true },
  ];

  // BUNDLE DISCOUNTS. Every bundle sits between 9% and 17% off the sum of its
  // parts. Keep new ones inside that band.
  //
  // b_gamepack was briefly 800 kr on Aug 10 2026, which was ~40% off its member
  // component value (299 + 299 + 379 + 349 = 1,326) and roughly double the
  // discount on anything else in the shop. Deng pulled it the same day. Now at
  // 1,099 member / 1,349 public, which is 17% off both. Nordic Kits unit costs
  // are still undocumented, so do not discount further until margin is known.
  var BUNDLES = [
    { id: 'b_starter',  name: 'Starter bundle',   desc: 'Tee + socks',                     member: 199,  pub: 259,  stock: 'soon', cat: 'bundle' },
    { id: 'b_gameday',  name: 'Game Day bundle',  desc: 'Jersey + socks',                  member: 339,  pub: 419,  stock: 'soon', cat: 'bundle', kit: true },
    { id: 'b_practice', name: 'Practice bundle',  desc: 'Tee + pants + socks',             member: 479,  pub: 599,  stock: 'soon', cat: 'bundle' },
    { id: 'b_full',     name: 'Full Talata',      desc: 'Hoodie + pants + tee + socks',    member: 799,  pub: 949,  stock: 'soon', cat: 'bundle' },
    { id: 'b_gamepack', name: 'Game Pack',        desc: 'Home + away jersey, hoodie + pants', member: 1099, pub: 1349, stock: 'soon', cat: 'bundle', bothKits: true },
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
