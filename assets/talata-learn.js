/* Learn the game, talatabasketball.dk/learn (Deng, 6 Nov 2026).
   Three levels for the players: the court, the rules and our first action,
   Dribble at. Each level ends with a quiz. The words come from the vault note
   Talata/Coaching/2026-11-06 — Learn the game.md. Change them there first,
   then in CONTENT below.
   The court is a FIBA half court in SVG, 500 units wide (15 m), baseline at
   the top. Players move along their paths with requestAnimationFrame because
   qa-check bans CSS @keyframes. With reduced motion they jump to the end. */
(function () {
  'use strict';

  /* ================================ CONTENT ================================ */

  // Player spots. Baseline at y 0, half-court line at y 466.7.
  var P = {
    top: [250, 305], wingL: [68, 218], wingR: [432, 218],
    cornerL: [26, 42], cornerR: [474, 42],
    dunkL: [148, 36], dunkR: [352, 36], rim: [250, 52.5]
  };

  // Level 1. Every place on the court, in words a 9-year-old can read.
  var KINDS = {
    rim:      { name: 'Rim', line: 'The hoop.', the: true },
    paint:    { name: 'Paint', line: 'The box under the hoop. Also called the lane.', the: true },
    block:    { name: 'Block', line: 'The mark on the side of the paint, close to the hoop.' },
    elbow:    { name: 'Elbow', line: 'Where the free-throw line meets the side of the paint.' },
    dunker:   { name: 'Dunker spot', line: 'On the baseline, just outside the paint, next to the hoop.' },
    short:    { name: 'Short corner', line: 'On the baseline, between the paint and the corner.' },
    corner:   { name: 'Corner', line: 'Where the baseline meets the three-point line.' },
    wing:     { name: 'Wing', line: 'On the side, outside the three-point line, halfway up.' },
    top:      { name: 'Top', line: 'In the middle, outside the three-point line, facing the hoop.', the: true },
    baseline: { name: 'Baseline', line: 'The end line behind the hoop.', the: true },
    sideline: { name: 'Sideline', line: 'The long line down each side of the court.' },
    three:    { name: 'Three-point line', line: 'The big curve. A shot from behind it counts 3.', the: true },
    ft:       { name: 'Free-throw line', line: 'The short line in front of the hoop where you shoot free throws.', the: true },
    half:     { name: 'Half-court line', line: 'The line across the middle of the court.', the: true }
  };

  // Where each place is, and where its name sits when you tap it.
  var SPOTS = [
    { k: 'rim', pt: [250, 52.5], bonus: 18, lab: [250, 94] },
    { k: 'paint', rect: [168.3, 0, 331.7, 193.3], lab: [250, 142] },
    { k: 'block', pt: [164, 73], lab: [150, 112] }, { k: 'block', pt: [336, 73], lab: [350, 112] },
    { k: 'elbow', pt: [168.3, 193.3], lab: [168, 232] }, { k: 'elbow', pt: [331.7, 193.3], lab: [332, 232] },
    { k: 'dunker', pt: [140, 30], lab: [130, 68] }, { k: 'dunker', pt: [360, 30], lab: [370, 68] },
    { k: 'short', pt: [86, 62], lab: [90, 100] }, { k: 'short', pt: [414, 62], lab: [410, 100] },
    { k: 'corner', pt: [22, 34], lab: [52, 78] }, { k: 'corner', pt: [478, 34], lab: [448, 78] },
    { k: 'wing', pt: [62, 222], lab: [62, 264] }, { k: 'wing', pt: [438, 222], lab: [438, 264] },
    { k: 'top', pt: [250, 318], lab: [250, 360] },
    { k: 'baseline', seg: [[0, 0], [500, 0]], lab: [430, 24] },
    { k: 'sideline', seg: [[0, 0], [0, 466.7]], lab: [54, 340] },
    { k: 'sideline', seg: [[500, 0], [500, 466.7]], lab: [446, 340] },
    { k: 'three', three: true, lab: [250, 262] },
    { k: 'ft', seg: [[168.3, 193.3], [331.7, 193.3]], lab: [250, 182] },
    { k: 'half', seg: [[0, 466.7], [500, 466.7]], lab: [250, 450] }
  ];

  // A move: who, how (cut, dribble, none), through which points, start ms, length ms.
  function m(id, kind, to, at, dur) { return { id: id, kind: kind, to: to, at: at, dur: dur }; }
  // A ball move: to a player (pass, hand) or to a point (shot).
  function b(to, kind, at, dur) { return { ball: to, kind: kind, at: at, dur: dur }; }

  // Level 2. Six rules, each with a short clip.
  var RULES = [
    { t: 'Spacing', d: 'Four out, one in. Two big steps apart, one player per spot.',
      w: 'Space makes every defender guard more floor.',
      clip: { start: { ents: { 1: [250, 262], 2: [298, 236], 3: [202, 240], 4: [326, 168], 5: [238, 158] }, ball: '1' },
        steps: [{ moves: [m('1', 'dribble', [P.top], 0, 800), m('2', 'cut', [P.wingR], 0, 900), m('3', 'cut', [P.wingL], 0, 900),
          m('4', 'cut', [[420, 110], P.cornerR], 0, 1100), m('5', 'cut', [P.dunkL], 0, 1000)] }] } },
    { t: 'Dribble at you means back door', d: 'Take one step up like you want the ball. Then cut behind your defender to the rim.',
      w: 'Your defender is high and watching the ball. The space behind them is open.',
      clip: { start: { ents: { 1: P.top, x1: [250, 280], 2: P.wingR, x2: [410, 240] }, ball: '1' },
        steps: [
          { moves: [m('1', 'dribble', [[320, 290], [382, 262]], 0, 1200), m('x1', 'none', [[312, 266], [358, 240]], 0, 1200)] },
          { moves: [m('2', 'cut', [[440, 240]], 0, 300), m('2', 'cut', [[418, 172], [330, 92], [262, 68]], 300, 850),
            m('x2', 'none', [[404, 190], [338, 132]], 650, 700)],
            ball: [b('2', 'pass', 650, 450), b(P.rim, 'shot', 1250, 320)] }] } },
    { t: 'Cut all the way through', d: 'If the pass does not come, keep running to the empty spot.',
      w: 'A player standing in the paint blocks the next drive and the next cut.',
      clip: { start: { ents: { 1: P.top, 2: P.wingR, x2: [410, 240], 3: P.wingL, 4: P.cornerR, 5: P.dunkL }, ball: '1' },
        steps: [
          { moves: [m('1', 'dribble', [[320, 290], [382, 262]], 0, 1100)] },
          { moves: [m('2', 'cut', [[440, 240]], 0, 300), m('2', 'cut', [[418, 172], [330, 92], [262, 68]], 300, 850),
            m('x2', 'none', [[400, 180], [318, 108], [290, 94]], 350, 850)] },
          { moves: [m('2', 'cut', [[200, 76], [110, 76], P.cornerL], 0, 1100), m('x2', 'none', [[214, 100], [120, 98], [58, 76]], 100, 1100)] }] } },
    { t: 'Lift', d: 'When the wing above you empties, come up out of the corner. Wait two counts first.',
      w: 'The ball handler needs someone to hand off to. The wait keeps the cut open.',
      clip: { start: { ents: { 1: [388, 256], 2: [262, 68], 4: P.cornerR, 3: P.wingL, 5: P.dunkL }, ball: '1' },
        steps: [{ moves: [m('2', 'cut', [[200, 76], [110, 76], P.cornerL], 0, 1200), m('4', 'cut', [[458, 128], [412, 236]], 900, 1000)] }] } },
    { t: 'Hand off, then roll', d: 'Hand it over. Then turn and run to the rim.',
      w: 'Your defender often steps out to stop the ball. For a second you are open.',
      clip: { start: { ents: { 1: [388, 256], x1: [364, 236], 4: [412, 236], 3: P.wingL, 5: P.dunkL, 2: P.cornerL }, ball: '1' },
        steps: [{ moves: [m('4', 'dribble', [[414, 276], [384, 300]], 280, 700), m('x1', 'none', [[352, 284]], 300, 550),
          m('1', 'cut', [[330, 170], [278, 92]], 300, 850)],
          ball: [b('4', 'hand', 0, 280), b('1', 'pass', 1150, 420), b(P.rim, 'shot', 1650, 320)] }] } },
    { t: 'Fill behind', d: 'After a cut or a roll, go to the empty spot.',
      w: 'We get back to four out, one in, and go again on the other side.',
      clip: { start: { ents: { 4: [384, 300], 1: [278, 92], 2: P.cornerL, 3: P.wingL, 5: P.dunkL }, ball: '4' },
        steps: [
          { moves: [m('1', 'cut', [[380, 62], P.cornerR], 0, 950)] },
          { moves: [m('4', 'dribble', [P.top], 0, 1000), m('1', 'cut', [[458, 128], P.wingR], 450, 950), m('5', 'cut', [[250, 26], P.dunkR], 250, 1100)] }] } }
  ];

  // Level 3. Dribble at, 4 out with the big in the dunker spot on the empty side.
  var START = { ents: { 1: P.top, 2: P.wingR, 3: P.wingL, 4: P.cornerR, 5: P.dunkL }, ball: '1' };
  var SETUP = 'Four out, one in. 1 has the ball at the top. 2 and 4 are on the right, wing and corner. 3 is on the left wing. The left corner is empty. 5 sits in the dunker spot on the empty side.';
  var A_STEPS = [
    { t: 'Dribble at', job: 'dribbleAt', say: '1 dribbles at 2. That is the call: Dribble at.',
      moves: [m('1', 'dribble', [[322, 288], [388, 256]], 0, 1300)] },
    { t: 'Back door', job: 'backDoor', say: '2 takes one step up, then cuts back door hard to the rim.',
      moves: [m('2', 'cut', [[440, 240]], 0, 350), m('2', 'cut', [[418, 172], [330, 92], [262, 68]], 350, 900)] },
    { t: 'Through', job: 'through', say: 'The pass does not come, so 2 keeps running, all the way through to the empty corner.',
      moves: [m('2', 'cut', [[200, 76], [110, 76], P.cornerL], 0, 1200)] },
    { t: 'Lift', job: 'lift', say: '4 lifts out of the corner to take the handoff.',
      moves: [m('4', 'cut', [[458, 128], [412, 236]], 0, 1000)] },
    { t: 'Handoff and roll', job: 'handoff', say: '1 hands it to 4, rolls to the rim, then fills the corner 4 left.',
      moves: [m('4', 'dribble', [[414, 276], [384, 300]], 280, 700), m('1', 'cut', [[330, 170], [284, 96]], 300, 850),
        m('1', 'cut', [[380, 62], P.cornerR], 1250, 950)],
      ball: [b('4', 'hand', 0, 280)] },
    { t: 'Reset', job: 'reset', say: '4 takes it to the top. 1 lifts to the wing. 5 slides to the new empty side.',
      moves: [m('4', 'dribble', [P.top], 0, 1000), m('1', 'cut', [[458, 128], P.wingR], 450, 950), m('5', 'cut', [[250, 26], P.dunkR], 250, 1100)] },
    { t: 'Dribble at, other side', job: 'dribbleAt', say: 'Same thing on the other side. 4 dribbles at 3.',
      moves: [m('4', 'dribble', [[178, 288], [112, 256]], 0, 1300)] },
    { t: 'Back door', job: 'backDoor', say: '3 takes one step up, then cuts back door hard to the rim.',
      moves: [m('3', 'cut', [[60, 240]], 0, 350), m('3', 'cut', [[82, 172], [170, 92], [238, 68]], 350, 900)] },
    { t: 'Through', job: 'through', say: 'The pass does not come, so 3 runs through to the empty corner.',
      moves: [m('3', 'cut', [[300, 76], [390, 76], P.cornerR], 0, 1200)] },
    { t: 'Lift', job: 'lift', say: '2 lifts out of the far corner to take the handoff.',
      moves: [m('2', 'cut', [[42, 128], [88, 236]], 0, 1000)] },
    { t: 'Handoff and roll', job: 'handoff', say: '4 hands it to 2, rolls to the rim, then fills the corner 2 left.',
      moves: [m('2', 'dribble', [[86, 276], [116, 300]], 280, 700), m('4', 'cut', [[170, 170], [216, 96]], 300, 850),
        m('4', 'cut', [[120, 62], P.cornerL], 1250, 950)],
      ball: [b('2', 'hand', 0, 280)] },
    { t: 'Same again', job: 'reset', say: '2 takes it to the top. 4 lifts. 5 slides back. Same shape, new players in each spot. Keep it going.',
      moves: [m('2', 'dribble', [P.top], 0, 1000), m('4', 'cut', [[42, 128], P.wingL], 450, 950), m('5', 'cut', [[250, 26], P.dunkL], 250, 1100)] }
  ];
  // Who plays which part in each half: D dribbles at, C cuts, L lifts, W waits on the far wing, B is the big.
  var ROLES = [{ 1: 'D', 2: 'C', 4: 'L', 3: 'W', 5: 'B' }, { 4: 'D', 3: 'C', 2: 'L', 1: 'W', 5: 'B' }];
  var JOBS = {
    setup:     { D: 'Start at the top with the ball.', C: 'Start on the wing on the ball side.', L: 'Start in the corner under the wing.',
                 W: 'Start on the far wing.', B: 'Start in the dunker spot on the empty side.' },
    dribbleAt: { D: 'Dribble hard at the wing.', C: 'The ball is coming at you. Get ready to go back door.', L: 'Hold the corner. You are next.',
                 W: 'Hold your spot on the far wing.', B: 'Stay in the dunker spot on the empty side.' },
    backDoor:  { D: 'Eyes on the cutter. Pass if the cutter is open.', C: 'One step up, then cut hard behind your man to the rim.', L: 'Hold the corner.',
                 W: 'Hold the far wing.', B: 'Stay low. Keep the lane clear for the cutter.' },
    through:   { D: 'Keep your dribble alive.', C: 'The pass is not there. Keep running, all the way to the empty corner.', L: 'Get ready to lift.',
                 W: 'Hold the far wing.', B: 'Stay put. Let the cutter run past you.' },
    lift:      { D: 'Dribble toward the lifter.', C: 'Hold the corner.', L: 'Come up out of the corner, toward the ball.',
                 W: 'Hold the far wing.', B: 'Stay in the dunker spot.' },
    handoff:   { D: 'Hand it off. Roll hard to the rim. If the pass is not there, fill the corner.', C: 'Hold the corner. You lift next.',
                 L: 'Take the handoff and come off the hip.', W: 'Hold the far wing. The ball comes to you next.',
                 B: 'Stay put. If your defender helps on the roller, you are open.' },
    reset:     { D: 'Lift from the corner to the wing.', C: 'Hold the corner. You lift next.', L: 'Bring the ball to the top.',
                 W: 'Get ready. The ball is coming at you.', B: 'Slide across to the dunker spot on the new empty side.' }
  };
  // Side reads. OPEN runs from before step 2, JAM from before step 4.
  var OPEN = { t: 'Open on the cut', say: '2 is open. 1 passes and 2 lays it in. That is the reward for cutting hard.',
    moves: A_STEPS[1].moves, ball: [b('2', 'pass', 700, 450), b(P.rim, 'shot', 1300, 320)] };
  var JAM = { t: 'Handoff jammed', say: '4\'s defender jumps in front to stop the handoff. 4 plants and goes back door. Same rule: they take the ball away, you take the space behind them.',
    add: { x4: [452, 74] },
    moves: [m('4', 'cut', [[458, 128], [440, 200]], 0, 800), m('x4', 'none', [[430, 150], [414, 226]], 100, 750),
      m('4', 'cut', [[404, 150], [310, 84], [262, 68]], 850, 850)],
    ball: [b('4', 'pass', 1250, 420), b(P.rim, 'shot', 1800, 320)] };

  // Level 2 quiz. A frame is the court frozen at one moment.
  var QUIZ2 = [
    { frame: { ents: { 1: [382, 262], x1: [358, 240], 2: P.wingR, x2: [410, 240], 3: P.wingL, 4: P.cornerR, 5: P.dunkL }, ball: '1' },
      trails: [['dribble', [P.top, [320, 290], [382, 262]]]], you: '2',
      q: 'You are 2. The ball is dribbled at you. What do you do?',
      opts: ['Cut back door to the rim', 'Stay and call for the ball', 'Go and set a screen'],
      why: 'Dribble at you means back door. The dribbler is taking your spot.' },
    { frame: { ents: { 1: [382, 262], 2: [262, 68], x2: [290, 94], 3: P.wingL, 4: P.cornerR, 5: P.dunkL }, ball: '1' },
      trails: [['cut', [[440, 240], [418, 172], [330, 92], [262, 68]]]], you: '2',
      q: 'You cut back door and the pass does not come. Where do you go?',
      opts: ['Through to the empty corner', 'Stop in the paint and wait', 'Back out to the wing'],
      why: 'Keep running to the empty spot. Standing in the paint blocks the next play.' },
    { frame: { ents: { 1: [382, 262], 2: P.cornerL, 4: P.cornerR, 3: P.wingL, 5: P.dunkL }, ball: '1' },
      trails: [['cut', [[262, 68], [200, 76], [110, 76], P.cornerL]]], you: '4',
      q: 'You are in the corner. The wing above you just emptied. What do you do?',
      opts: ['Lift up to the wing', 'Stay in the corner', 'Cut to the rim'],
      why: 'Lift when the spot above you is empty. The ball handler needs you for the handoff.' },
    { frame: { ents: { 1: [388, 256], 4: [412, 236], 2: P.cornerL, 3: P.wingL, 5: P.dunkL }, ball: '4' }, you: '1',
      q: 'You are 1. You just handed the ball to 4. What now?',
      opts: ['Roll hard to the rim', 'Stand and watch', 'Run back on defense'],
      why: 'Roll. Your defender often steps out to stop the ball, so for a second you are open.' },
    { frame: { ents: { 1: P.top, x1: [250, 280], 2: P.wingR, x2: [410, 240], 3: P.wingL, 4: P.cornerR, 5: P.dunkL }, ball: '1' }, you: '2',
      q: 'You are 2. The ball is about to come at you. Before you cut back door, what do you do?',
      opts: ['Take one step up, like you want the ball', 'Clap and call for the ball', 'Turn your back to the ball'],
      why: 'The fake step pulls your defender up. Then the space behind them opens.' },
    { frame: { ents: { 1: P.top, 2: [458, 64], 4: [482, 30], 3: P.wingL, 5: P.dunkL }, ball: '1' },
      q: 'What is wrong in this picture?',
      opts: ['Two players in one corner', 'The ball is at the top', '5 is in the dunker spot'],
      why: 'One player per spot, two big steps apart. The right wing is empty, so one of them belongs there.' }
  ];

  // Words. Places come from KINDS. "kids" marks the Level 1 words.
  var MOVES = [
    { w: 'Dribble', d: 'Bounce the ball while you move.', kids: true },
    { w: 'Pass', d: 'Throw the ball to a teammate.', kids: true },
    { w: 'Cut', d: 'Run hard to a new spot to get open.', kids: true },
    { w: 'Back-door cut', d: 'Cut behind your defender, to the hoop.' },
    { w: 'Basket cut', d: 'Cut straight to the hoop.' },
    { w: 'V-cut', d: 'Step one way, then cut the other way to get open.' },
    { w: 'Lift', d: 'Come up from the corner to the wing.' },
    { w: 'Fill', d: 'Move into the spot a teammate just left.' },
    { w: 'Handoff', d: 'Hand the ball to a teammate as they run past you. Also called a DHO, a dribble handoff.' },
    { w: 'Roll', d: 'After a handoff or a screen, run to the hoop.' },
    { w: 'Pop', d: 'After a screen, step out for a shot.' },
    { w: 'Screen', d: 'Stand still so your teammate\'s defender bumps into you.' },
    { w: 'Sell', d: 'A fake step that sends your defender the wrong way.' }
  ];
  var TEAM = [
    { w: 'Spacing', d: 'Two big steps apart, one player per spot.', kids: true },
    { w: 'Ball side', d: 'The half of the court where the ball is.' },
    { w: 'Help side', d: 'The half without the ball. Also called the weak side.' },
    { w: 'Four out, one in', d: 'Four players outside the three-point line, one big inside.' },
    { w: 'Dribble at', d: 'Our call. A teammate dribbles at you, you cut back door.' },
    { w: 'Read', d: 'What your defender does, and what you do about it.' },
    { w: 'Closeout', d: 'A defender runs at a shooter with their hands up.' }
  ];

  /* ================================ ENGINE ================================= */

  var NS = 'http://www.w3.org/2000/svg';
  var HOOP = P.rim;
  var BALL_OFF = [12, -12];
  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function h(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function btn(label, cls, parent, fn) {
    var n = h('button', 'lg-btn' + (cls ? ' ' + cls : ''), label, parent);
    n.type = 'button';
    if (fn) n.addEventListener('click', fn);
    return n;
  }
  function dist(a, c) { var x = a[0] - c[0], y = a[1] - c[1]; return Math.sqrt(x * x + y * y); }
  function clamp(u) { return u < 0 ? 0 : u > 1 ? 1 : u; }
  function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function byAt(a, c) { return a.at - c.at; }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function kindName(k) { var K = KINDS[k], n = K.name.toLowerCase(); return (K.the ? 'the ' : /^[aeiou]/.test(n) ? 'an ' : 'a ') + n; }

  // Smooth a list of points (Catmull-Rom), then resample every 2.5 units.
  // A dribble gets a zigzag on its trail; the player still runs the smooth line.
  function samplePath(pts, zig) {
    var raw = [pts[0]];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
      var n = Math.max(4, Math.ceil(dist(p1, p2) / 4));
      for (var s = 1; s <= n; s++) {
        var t = s / n, t2 = t * t, t3 = t2 * t;
        raw.push([0, 1].map(function (d) {
          return 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t3);
        }));
      }
    }
    var out = [raw[0]], step = 2.5, acc = 0, total = 0;
    for (i = 1; i < raw.length; i++) {
      var a = raw[i - 1], c = raw[i], seg = dist(a, c);
      total += seg;
      while (acc + seg >= step) {
        var f = (step - acc) / seg;
        a = [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f];
        out.push(a);
        seg = dist(a, c);
        acc = 0;
      }
      acc += seg;
    }
    var last = pts[pts.length - 1];
    if (dist(out[out.length - 1], last) > 0.01) out.push(last);
    var trail = out;
    if (zig) {
      trail = out.map(function (p, j) {
        var q = out[Math.min(j + 1, out.length - 1)], r = out[Math.max(j - 1, 0)];
        var dx = q[0] - r[0], dy = q[1] - r[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
        var sAt = j * step, taper = Math.min(1, sAt / 10, (out.length - 1 - j) * step / 22);
        var x = sAt / 14, tri = 2 * Math.abs(2 * (x - Math.floor(x + 0.5))) - 1;
        return [p[0] - dy / l * 4.5 * tri * taper, p[1] + dx / l * 4.5 * tri * taper];
      });
    }
    return { pts: out, trail: trail };
  }
  function atLen(list, e) {
    var f = e * (list.length - 1), i = Math.floor(f), r = f - i, a = list[i], c = list[Math.min(i + 1, list.length - 1)];
    return [a[0] + (c[0] - a[0]) * r, a[1] + (c[1] - a[1]) * r];
  }
  // The trail stops 20 units behind the player, so its arrowhead shows at the end.
  function trailPoints(list, e) {
    var n = list.length - 1, upto = e * n - 8;
    if (upto < 1) return '';
    var out = [], i;
    for (i = 0; i <= Math.floor(upto); i++) out.push(list[i][0].toFixed(1) + ',' + list[i][1].toFixed(1));
    var p = atLen(list, upto / n);
    out.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
    return out.join(' ');
  }

  function dSeg(p, a, c) {
    var dx = c[0] - a[0], dy = c[1] - a[1], l = dx * dx + dy * dy;
    var t = l ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l) : 0;
    return dist(p, [a[0] + t * dx, a[1] + t * dy]);
  }
  function dThree(p) {
    var d = Math.min(dSeg(p, [30, 0], [30, 99.7]), dSeg(p, [470, 0], [470, 99.7]));
    var vx = p[0] - HOOP[0], vy = p[1] - HOOP[1], r = Math.sqrt(vx * vx + vy * vy) || 1;
    if (HOOP[1] + 225 * vy / r >= 99.7) d = Math.min(d, Math.abs(r - 225));
    return d;
  }
  // Lower is closer. Points and lines win over the paint around them.
  function spotScore(s, p) {
    if (s.pt) return dist(p, s.pt) - (s.bonus || 12);
    if (s.seg) return dSeg(p, s.seg[0], s.seg[1]) - 6;
    if (s.three) return dThree(p) - 6;
    var r = s.rect, dx = Math.max(r[0] - p[0], 0, p[0] - r[2]), dy = Math.max(r[1] - p[1], 0, p[1] - r[3]);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function nearestSpot(p) {
    var best = null, bs = 1e9;
    SPOTS.forEach(function (s) { var v = spotScore(s, p); if (v < bs) { bs = v; best = s; } });
    return bs < 40 ? best : null;
  }

  // Apply a step without drawing it: where everybody ends up.
  function after(state, step) {
    var s = clone(state);
    if (step.add) Object.keys(step.add).forEach(function (id) { s.ents[id] = step.add[id]; });
    (step.moves || []).slice().sort(byAt).forEach(function (mv) { s.ents[mv.id] = mv.to[mv.to.length - 1]; });
    var bl = (step.ball || []).slice().sort(byAt);
    if (bl.length) s.ball = bl[bl.length - 1].ball;
    return s;
  }

  var THREE_D = 'M30 0 L30 99.7 A225 225 0 0 0 470 99.7 L470 0';
  function drawCourt(g) {
    el('rect', { x: 0, y: 0, width: 500, height: 466.7, 'class': 'lg-floor' }, g);
    el('rect', { x: 168.3, y: 0, width: 163.4, height: 193.3, 'class': 'lg-paintfill' }, g);
    el('rect', { x: 0, y: 0, width: 500, height: 466.7, 'class': 'lg-l' }, g);
    el('rect', { x: 168.3, y: 0, width: 163.4, height: 193.3, 'class': 'lg-l' }, g);
    el('path', { d: 'M190 193.3 A60 60 0 0 0 310 193.3', 'class': 'lg-l' }, g);
    el('path', { d: THREE_D, 'class': 'lg-l' }, g);
    el('path', { d: 'M208.3 40 L208.3 52.5 A41.7 41.7 0 0 0 291.7 52.5 L291.7 40', 'class': 'lg-l lg-thin' }, g);
    el('path', { d: 'M190 466.7 A60 60 0 0 1 310 466.7', 'class': 'lg-l' }, g);
    el('rect', { x: 159.5, y: 68, width: 8.8, height: 10, 'class': 'lg-mark' }, g);
    el('rect', { x: 331.7, y: 68, width: 8.8, height: 10, 'class': 'lg-mark' }, g);
    el('line', { x1: 220, y1: 40, x2: 280, y2: 40, 'class': 'lg-l lg-board' }, g);
    el('line', { x1: 250, y1: 40, x2: 250, y2: 45, 'class': 'lg-l lg-thin' }, g);
    el('circle', { cx: 250, cy: 52.5, r: 7.5, 'class': 'lg-rim' }, g);
  }

  // One court on the page. It holds players, the ball, trails and marks.
  function Court(host, uid, opts) {
    opts = opts || {};
    var svg = el('svg', { viewBox: '-8 -8 516 483', 'class': 'lg-svg', role: 'img', 'aria-label': 'A basketball half court' });
    host.appendChild(svg);
    var defs = el('defs', {}, svg);
    var mk = el('marker', { id: uid + '-ar', viewBox: '0 0 10 10', refX: '6', refY: '5', markerWidth: '3.6', markerHeight: '3.6', orient: 'auto' }, defs);
    el('path', { d: 'M0 0 L10 5 L0 10 z', 'class': 'lg-arhead' }, mk);
    var gCourt = el('g', {}, svg), gDots = el('g', { 'class': 'lg-dots' }, svg), gMarks = el('g', {}, svg),
        gTrails = el('g', {}, svg), gEnts = el('g', {}, svg), gFx = el('g', {}, svg);
    drawCourt(gCourt);
    SPOTS.forEach(function (s) { if (s.pt && s.k !== 'rim') el('circle', { cx: s.pt[0], cy: s.pt[1], r: 4.5, 'class': 'lg-dot' }, gDots); });
    if (!opts.dots) gDots.style.display = 'none';

    var ents = {}, ball = { g: null, x: 0, y: 0, holder: null }, raf = null, timer = null, me = null, you = null;
    ball.g = el('circle', { r: 7, 'class': 'lg-ball' }, gFx);
    ball.g.style.display = 'none';

    function makeEnt(id) {
      var g = el('g', { 'class': 'lg-ent ' + (id.charAt(0) === 'x' ? 'lg-def' : 'lg-off') }, gEnts);
      el('circle', { r: 24, 'class': 'lg-ring-edge' }, g);
      el('circle', { r: 23, 'class': 'lg-ring' }, g);
      if (id.charAt(0) === 'x') {
        el('line', { x1: -11, y1: -11, x2: 11, y2: 11 }, g);
        el('line', { x1: 11, y1: -11, x2: -11, y2: 11 }, g);
      } else {
        el('circle', { r: 17, 'class': 'disc' }, g);
        var t = el('text', { y: 6.5 }, g);
        t.textContent = id;
      }
      ents[id] = { g: g, x: 0, y: 0 };
      return ents[id];
    }
    function setPos(id, p) { var e = ents[id]; e.x = p[0]; e.y = p[1]; e.g.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ')'); }
    function posOf(id) { return [ents[id].x, ents[id].y]; }
    function ballPos() { return ball.holder && ents[ball.holder] ? [ents[ball.holder].x + BALL_OFF[0], ents[ball.holder].y + BALL_OFF[1]] : [ball.x, ball.y]; }
    function drawBall() { var p = ballPos(); ball.x = p[0]; ball.y = p[1]; ball.g.setAttribute('cx', p[0].toFixed(1)); ball.g.setAttribute('cy', p[1].toFixed(1)); }
    function paintRoles() {
      Object.keys(ents).forEach(function (id) {
        ents[id].g.classList.toggle('me', id === me);
        ents[id].g.classList.toggle('you', id === you);
      });
      svg.classList.toggle('focus', !!me);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      raf = null; timer = null;
    }
    function clearTrails() { while (gTrails.firstChild) gTrails.removeChild(gTrails.firstChild); }
    function clearFx() { Array.prototype.slice.call(gFx.childNodes).forEach(function (n) { if (n !== ball.g) gFx.removeChild(n); }); }
    function clearMarks() { while (gMarks.firstChild) gMarks.removeChild(gMarks.firstChild); }
    function markEmpty() {
      clearMarks();
      if (!opts.empty) return;
      [P.cornerL, P.cornerR].forEach(function (c) {
        var taken = Object.keys(ents).some(function (id) { return id.charAt(0) !== 'x' && dist(posOf(id), c) < 34; });
        if (taken) return;
        el('circle', { cx: c[0], cy: c[1], r: 18, 'class': 'lg-empty' }, gMarks);
        var t = el('text', { x: c[0] < 250 ? 36 : 464, y: c[1] + 42, 'class': 'lg-empty-t' }, gMarks);
        t.textContent = 'Empty';
      });
    }

    function load(state) {
      stop(); clearTrails(); clearFx();
      Object.keys(ents).forEach(function (id) { if (!state.ents[id]) { gEnts.removeChild(ents[id].g); delete ents[id]; } });
      Object.keys(state.ents).forEach(function (id) { (ents[id] || makeEnt(id)); setPos(id, state.ents[id]); });
      if (state.ball == null) { ball.holder = null; ball.g.style.display = 'none'; }
      else {
        ball.g.style.display = '';
        if (typeof state.ball === 'string') ball.holder = state.ball;
        else { ball.holder = null; ball.x = state.ball[0]; ball.y = state.ball[1]; }
        drawBall();
      }
      paintRoles();
      markEmpty();
    }

    // Draw one step over time. Earlier trails fade, older ones go.
    function play(step, done, speed) {
      stop(); clearMarks();
      Array.prototype.slice.call(gTrails.childNodes).forEach(function (n) {
        if (n.classList.contains('old')) gTrails.removeChild(n); else n.classList.add('old');
      });
      if (step.add) Object.keys(step.add).forEach(function (id) { (ents[id] || makeEnt(id)); setPos(id, step.add[id]); });
      paintRoles();
      var cur = {};
      Object.keys(ents).forEach(function (id) { cur[id] = posOf(id); });
      var tracks = (step.moves || []).slice().sort(byAt).map(function (mv) {
        var smp = samplePath([cur[mv.id]].concat(mv.to), mv.kind === 'dribble');
        cur[mv.id] = mv.to[mv.to.length - 1];
        var line = mv.kind === 'none' ? null : el('polyline', { 'class': 'lg-trail ' + mv.kind, 'marker-end': 'url(#' + uid + '-ar)' }, gTrails);
        return { mv: mv, smp: smp, line: line };
      });
      var balls = (step.ball || []).slice().sort(byAt).map(function (bm) { return { bm: bm, from: null, line: null, done: false }; });
      var end = 0;
      tracks.forEach(function (t) { end = Math.max(end, t.mv.at + t.mv.dur); });
      balls.forEach(function (t) { end = Math.max(end, t.bm.at + t.bm.dur); });
      var t0 = null, sp = speed || 1;

      function frame(ts) {
        if (t0 === null) t0 = ts;
        var t = reduce ? end : (ts - t0) * sp;
        tracks.forEach(function (tr) {
          var u = clamp((t - tr.mv.at) / tr.mv.dur);
          if (u <= 0) return;
          var e = ease(u);
          setPos(tr.mv.id, atLen(tr.smp.pts, e));
          if (tr.line) tr.line.setAttribute('points', trailPoints(tr.smp.trail, e));
        });
        balls.forEach(function (bt) {
          var u = (t - bt.bm.at) / bt.bm.dur;
          if (u < 0) return;
          if (!bt.from) {
            bt.from = ballPos();
            ball.holder = null;
            ball.g.style.display = '';
            if (bt.bm.kind === 'pass') bt.line = el('line', { 'class': 'lg-trail pass', 'marker-end': 'url(#' + uid + '-ar)' }, gTrails);
          }
          var e = ease(clamp(u));
          var to = typeof bt.bm.ball === 'string' ? [ents[bt.bm.ball].x + BALL_OFF[0], ents[bt.bm.ball].y + BALL_OFF[1]] : bt.bm.ball;
          ball.x = bt.from[0] + (to[0] - bt.from[0]) * e;
          ball.y = bt.from[1] + (to[1] - bt.from[1]) * e;
          if (bt.line) {
            var L = dist(bt.from, to), k = L ? Math.max(0, Math.min(e * L, L - 22)) / L : 0;
            bt.line.setAttribute('x1', bt.from[0].toFixed(1)); bt.line.setAttribute('y1', bt.from[1].toFixed(1));
            bt.line.setAttribute('x2', (bt.from[0] + (to[0] - bt.from[0]) * k).toFixed(1));
            bt.line.setAttribute('y2', (bt.from[1] + (to[1] - bt.from[1]) * k).toFixed(1));
          }
          if (u >= 1 && !bt.done) { bt.done = true; if (typeof bt.bm.ball === 'string') ball.holder = bt.bm.ball; }
        });
        drawBall();
        if (t < end) raf = requestAnimationFrame(frame);
        else { raf = null; markEmpty(); if (done) done(); }
      }
      raf = requestAnimationFrame(frame);
    }

    // Steps back to back, with a short pause between them.
    function run(steps, done, each, speed) {
      var i = 0;
      (function next() {
        if (i >= steps.length) { if (done) done(); return; }
        var s = steps[i++];
        if (each) each(s, i - 1);
        play(s, function () { timer = setTimeout(next, reduce ? 0 : 450 / (speed || 1)); }, speed);
      })();
    }

    function staticTrail(kind, pts) {
      var smp = samplePath(pts, kind === 'dribble');
      el('polyline', { 'class': 'lg-trail ' + kind, 'marker-end': 'url(#' + uid + '-ar)', points: trailPoints(smp.trail, 1) }, gTrails);
    }
    function hiSpot(s, cls) {
      if (s.pt) return el('circle', { cx: s.pt[0], cy: s.pt[1], r: s.k === 'rim' ? 15 : 20, 'class': cls }, gFx);
      if (s.seg) return el('line', { x1: s.seg[0][0], y1: s.seg[0][1], x2: s.seg[1][0], y2: s.seg[1][1], 'class': cls + ' line' }, gFx);
      if (s.three) return el('path', { d: THREE_D, 'class': cls + ' line' }, gFx);
      return el('rect', { x: s.rect[0], y: s.rect[1], width: s.rect[2] - s.rect[0], height: s.rect[3] - s.rect[1], 'class': cls + ' area' }, gFx);
    }
    function tag(s) {
      var t = el('text', { x: s.lab[0], y: s.lab[1], 'class': 'lg-tag' }, gFx);
      t.textContent = KINDS[s.k].name;
    }
    function ring(p, r) { el('circle', { cx: p[0], cy: p[1], r: r || 26, 'class': 'lg-ans' }, gFx); }
    function tapDot(p) { el('circle', { cx: p[0], cy: p[1], r: 6, 'class': 'lg-tapdot' }, gFx); }

    var tapFn = null;
    svg.addEventListener('click', function (ev) {
      if (!tapFn) return;
      var pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      var m2 = svg.getScreenCTM();
      if (!m2) return;
      var q = pt.matrixTransform(m2.inverse());
      tapFn([Math.max(0, Math.min(500, q.x)), Math.max(0, Math.min(466.7, q.y))]);
    });

    return {
      svg: svg, load: load, play: play, run: run, stop: stop, clearFx: clearFx, staticTrail: staticTrail,
      hiSpot: hiSpot, tag: tag, ring: ring, tapDot: tapDot,
      // A delayed start that stop() cancels, so a reveal never lands on the next question.
      later: function (fn, ms) { if (timer) clearTimeout(timer); timer = setTimeout(fn, reduce ? 0 : ms); },
      onTap: function (fn) { tapFn = fn; svg.classList.toggle('tappable', !!fn); },
      focus: function (id) { me = id; paintRoles(); },
      you: function (id) { you = id; paintRoles(); },
      dots: function (on) { gDots.style.display = on && opts.dots ? '' : 'none'; },
      empty: function (on) { opts.empty = on; markEmpty(); }
    };
  }

  /* ============================== PAGE PARTS =============================== */

  var KEY = 'talata-learn-v1';
  function readBest() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveBest(lv, score, total) {
    var s = readBest(), prev = s[lv];
    if (!prev || score > prev.s) {
      s[lv] = { s: score, n: total };
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    }
    paintBest();
    return s[lv] || { s: score, n: total };
  }
  function paintBest() {
    var s = readBest();
    Array.prototype.forEach.call(document.querySelectorAll('.lg-tab'), function (t) {
      var r = s[t.getAttribute('data-lv')], out = t.querySelector('.best');
      if (out) out.textContent = r ? 'Best ' + r.s + ' of ' + r.n : '';
    });
  }

  // The shell each level draws into: court, caption, controls, quiz box.
  function stage(host) {
    var root = h('div', 'lg-stage', null, host);
    var court = h('div', 'lg-court', null, root);
    var cap = h('div', 'lg-cap', null, root);
    cap.setAttribute('aria-live', 'polite');
    var count = h('p', 'lg-count', null, cap), title = h('p', 'lg-cap-t', null, cap),
        say = h('p', 'lg-cap-d', null, cap), why = h('p', 'lg-cap-w', null, cap), job = h('p', 'lg-cap-job', null, cap);
    var ctl = h('div', 'lg-ctl', null, root);
    var quiz = h('div', 'lg-quiz', null, root);
    quiz.hidden = true;
    function set(o) {
      count.textContent = o.count || ''; title.textContent = o.t || ''; say.textContent = o.d || '';
      why.textContent = o.w || ''; job.textContent = o.job || '';
      count.hidden = !o.count; why.hidden = !o.w; job.hidden = !o.job;
    }
    return { root: root, court: court, ctl: ctl, quiz: quiz, set: set };
  }
  function row(parent, label) {
    var r = h('div', 'lg-row', null, parent);
    if (label) h('span', 'lab', label, r);
    return r;
  }

  // One quiz engine for all three levels.
  // A question: { type: 'pick'|'tap', frame, you, q, opts (answer first), why, check(p), ans, reveal(court) }
  function Quiz(st, court, lv, build, onLeave) {
    var list, i, score, locked;
    var box = st.quiz;
    var qn = h('p', 'lg-count', null, box), qp = h('p', 'lg-qp', null, box), qa = h('div', 'lg-qa', null, box),
        qf = h('p', 'lg-qf', null, box), qx = h('div', 'lg-row', null, box);
    qf.setAttribute('aria-live', 'polite');

    function start() {
      list = build(); i = 0; score = 0;
      st.root.classList.add('quizzing');
      box.hidden = false;
      court.focus(null);
      ask();
      st.root.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }
    function ask() {
      var q = list[i];
      locked = false;
      court.stop();
      court.empty(false);
      court.dots(false);
      court.load(q.frame || { ents: {}, ball: null });
      (q.trails || []).forEach(function (t) { court.staticTrail(t[0], t[1]); });
      court.you(q.you || null);
      qn.textContent = 'Question ' + (i + 1) + ' of ' + list.length;
      qp.textContent = q.q;
      qa.textContent = ''; qf.textContent = ''; qf.className = 'lg-qf'; qx.textContent = '';
      if (q.type === 'pick') {
        shuffle(q.opts.map(function (o, j) { return { o: o, j: j }; })).forEach(function (x) {
          var b2 = btn(x.o, 'lg-opt', qa, function () { pick(x.j, b2); });
          b2.setAttribute('data-j', x.j);
        });
      } else {
        h('p', 'lg-hint', 'Tap the court.', qa);
      }
    }
    function pick(j, el2) {
      if (locked) return;
      var q = list[i];
      Array.prototype.forEach.call(qa.querySelectorAll('.lg-opt'), function (o) {
        o.disabled = true;
        if (o.getAttribute('data-j') === '0') o.classList.add('right');
      });
      if (j !== 0) el2.classList.add('wrong');
      finish(j === 0, j === 0 ? q.why : 'Answer: ' + q.opts[0] + '. ' + q.why);
      if (q.reveal) q.reveal(court);
    }
    function tap(p) {
      if (locked || box.hidden) return false;
      var q = list[i];
      if (q.type !== 'tap') return true;
      var r = q.check(p);
      court.clearFx();
      court.tapDot(p);
      finish(r.ok, r.msg);
      if (r.show) r.show(court);
      return true;
    }
    function finish(ok, msg) {
      locked = true;
      if (ok) score++;
      qf.textContent = (ok ? 'Yes. ' : '') + msg;
      qf.className = 'lg-qf ' + (ok ? 'ok' : 'no');
      btn(i < list.length - 1 ? 'Next question' : 'See my score', 'main', qx, next).focus({ preventScroll: true });
    }
    function next() { i++; if (i >= list.length) end(); else ask(); }
    function end() {
      var best = saveBest(lv, score, list.length);
      court.stop(); court.load({ ents: {}, ball: null }); court.you(null);
      qn.textContent = 'Your score';
      qp.textContent = score + ' of ' + list.length;
      qa.textContent = '';
      var all = score === list.length;
      qf.className = 'lg-qf ' + (all ? 'ok' : '');
      qf.textContent = (all ? 'Full marks. ' : score >= Math.ceil(list.length * 0.75) ? 'Good. ' : 'Go through the level once more, then try again. ') +
        'Screenshot this and send it to your team group.' + (best.s > score ? ' Your best is ' + best.s + ' of ' + best.n + '.' : '');
      qx.textContent = '';
      btn('Try again', 'main', qx, start);
      btn('Back to the level', '', qx, leave);
    }
    function leave() {
      st.root.classList.remove('quizzing');
      box.hidden = true;
      court.you(null);
      if (onLeave) onLeave();
    }
    return { start: start, tap: tap, active: function () { return !box.hidden; }, leave: leave };
  }

  /* ---------------------------- Level 1: court ---------------------------- */
  function levelCourt(host) {
    var st = stage(host);
    var c = Court(st.court, 'lc1', { dots: true });
    function idle() {
      c.load({ ents: {}, ball: null });
      c.dots(true);
      st.set({ t: 'Tap the court', d: 'Tap any line, spot or box. Its name shows up here.' });
    }
    var quiz = Quiz(st, c, 'court', function () {
      return shuffle(Object.keys(KINDS)).slice(0, 8).map(function (k) {
        return { type: 'tap', q: 'Tap ' + kindName(k) + '.', check: function (p) {
          var s = nearestSpot(p);
          var ok = !!s && s.k === k;
          return { ok: ok,
            msg: ok ? KINDS[k].name + '. ' + KINDS[k].line
                    : (s ? 'That is ' + kindName(s.k) + '. ' : '') + 'Here is ' + kindName(k) + '. ' + KINDS[k].line,
            show: function (court) {
              if (s && !ok) court.hiSpot(s, 'lg-hi miss');
              SPOTS.forEach(function (x) { if (x.k === k) { court.hiSpot(x, 'lg-hi'); } });
              SPOTS.some(function (x) { if (x.k === k) { court.tag(x); return true; } return false; });
            } };
        } };
      });
    }, idle);
    c.onTap(function (p) {
      if (quiz.active()) { quiz.tap(p); return; }
      var s = nearestSpot(p);
      c.clearFx();
      if (!s) { st.set({ t: 'Open floor', d: 'Try a line, a spot or the paint.' }); return; }
      c.hiSpot(s, 'lg-hi');
      c.tag(s);
      st.set({ t: KINDS[s.k].name, d: KINDS[s.k].line });
    });
    var r = row(st.ctl);
    btn('Take the quiz', 'main', r, function () { quiz.start(); });
    var cards = h('div', 'lg-cards', null, st.ctl);
    [['Spacing', 'Two big steps apart. One player per spot.'], ['Cut', 'Run hard to a new spot to get open.']].forEach(function (w) {
      var cd = h('div', 'lg-card', null, cards);
      h('b', '', w[0], cd);
      h('span', '', w[1], cd);
    });
    idle();
    return { show: function () {} };
  }

  /* ---------------------------- Level 2: rules ---------------------------- */
  function levelRules(host) {
    var st = stage(host);
    var c = Court(st.court, 'lc2');
    var cur = 0, picks = [];
    function show(i) {
      cur = i;
      picks.forEach(function (p, j) { p.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      var R = RULES[i];
      st.set({ count: 'Rule ' + (i + 1) + ' of ' + RULES.length, t: R.t, d: R.d, w: 'Why: ' + R.w });
      c.load(R.clip.start);
      c.run(R.clip.steps);
    }
    var quiz = Quiz(st, c, 'rules', function () {
      return QUIZ2.map(function (q) { var o = clone(q); o.type = 'pick'; return o; });
    }, function () { show(cur); });
    var r1 = row(st.ctl, 'Rule');
    RULES.forEach(function (R, i) {
      var p = btn(String(i + 1), 'sq', r1, function () { show(i); });
      p.setAttribute('aria-label', 'Rule ' + (i + 1) + ': ' + R.t);
      picks.push(p);
    });
    var r2 = row(st.ctl);
    btn('Replay', '', r2, function () { show(cur); });
    btn('Next rule', '', r2, function () { show((cur + 1) % RULES.length); });
    btn('Take the quiz', 'main', r2, function () { quiz.start(); });
    c.onTap(function (p) { if (quiz.active()) quiz.tap(p); });
    var shown = false;
    return { show: function () { if (!shown) { shown = true; show(0); } } };
  }

  /* -------------------------- Level 3: Dribble at -------------------------- */
  function levelAction(host) {
    var st = stage(host);
    var c = Court(st.court, 'lc3', { empty: true });
    var snaps = [START];
    A_STEPS.forEach(function (s, i) { snaps.push(after(snaps[i], s)); });
    var k = -1, me = null, all = false, speed = 1;

    function half(i) { return i >= 6 ? 1 : 0; }
    function jobLine(job, hf) {
      if (!me) return '';
      return 'Your job as ' + me + ': ' + JOBS[job][ROLES[hf][me]];
    }
    function caption(extra) {
      if (extra) { st.set({ count: 'Read', t: extra.t, d: extra.say }); }
      else if (k < 0) st.set({ count: 'Set up', t: 'Dribble at', d: SETUP, job: jobLine('setup', 0) });
      else st.set({ count: 'Step ' + (k + 1) + ' of ' + A_STEPS.length, t: A_STEPS[k].t, d: A_STEPS[k].say, job: jobLine(A_STEPS[k].job, half(k)) });
      back.disabled = k < 0;
      fwd.disabled = k >= A_STEPS.length - 1;
      openB.hidden = k !== 1;
      jamB.hidden = k !== 3;
      allB.textContent = all ? 'Stop' : 'Play all';
    }
    function show(i) {
      all = false;
      k = i;
      c.stop();
      if (i < 0) { c.load(snaps[0]); caption(); return; }
      c.load(snaps[i]);
      caption();
      c.play(A_STEPS[i], null, speed);
    }
    function playAll() {
      if (all) { all = false; c.stop(); c.load(snaps[k + 1] || snaps[0]); caption(); return; }
      var from = k >= A_STEPS.length - 1 ? 0 : k + 1;
      c.load(snaps[from]);
      all = true;
      c.run(A_STEPS.slice(from), function () { all = false; caption(); }, function (s, j) { k = from + j; caption(); }, speed);
      caption();
    }
    function side(read, at) {
      all = false;
      c.load(snaps[at]);
      caption(read);
      c.play(read, null, speed);
    }

    var r1 = row(st.ctl);
    var back = btn('Back', '', r1, function () { show(k - 1); });
    var fwd = btn('Next', 'main', r1, function () { show(k + 1); });
    var allB = btn('Play all', '', r1, playAll);
    var slow = btn('Slow', '', r1, function () { speed = speed === 1 ? 0.5 : 1; slow.setAttribute('aria-pressed', speed < 1 ? 'true' : 'false'); });
    slow.setAttribute('aria-pressed', 'false');
    var r2 = row(st.ctl, 'Be number');
    var who = [];
    ['All', '1', '2', '3', '4', '5'].forEach(function (n) {
      var w = btn(n, 'sq', r2, function () {
        me = n === 'All' ? null : n;
        who.forEach(function (x) { x.setAttribute('aria-pressed', x === w ? 'true' : 'false'); });
        c.focus(me);
        if (!all) caption();
      });
      w.setAttribute('aria-pressed', n === 'All' ? 'true' : 'false');
      if (n === 'All') w.classList.remove('sq');
      who.push(w);
    });
    var r3 = row(st.ctl);
    var openB = btn('Open on the cut? See the layup', '', r3, function () { side(OPEN, 1); });
    var jamB = btn('Handoff jammed? See the read', '', r3, function () { side(JAM, 3); });
    var r4 = row(st.ctl);
    btn('Take the quiz', 'main', r4, function () { quiz.start(); });

    function tapQ(q, you, frame, ans, r, msgOk, reveal) {
      return { type: 'tap', frame: frame, you: you, q: q, check: function (p) {
        var ok = dist(p, ans) <= r;
        return { ok: ok, msg: ok ? msgOk : 'The right spot is circled. ' + msgOk, show: function (court) { court.ring(ans, 26); if (reveal) court.later(function () { reveal(court); }, 500); } };
      } };
    }
    function pickQ(q, you, frame, opts, why, reveal) { return { type: 'pick', frame: frame, you: you, q: q, opts: opts, why: why, reveal: reveal }; }
    var jamFrame = clone(snaps[3]);
    jamFrame.ents['4'] = [440, 200];
    jamFrame.ents.x4 = [414, 226];

    var quiz = Quiz(st, c, 'dribble-at', function () {
      return [
        pickQ('The ball is at the top. Which corner is empty?', null, START,
          ['The far corner, away from the dribble at', 'The corner on the dribble-at side', 'Neither. Both corners are filled'],
          'The cutter needs a place to go, so the empty corner is on the far side.'),
        tapQ('You are 2. 1 just dribbled at you and the pass does not come. Tap where you end up.', '2', snaps[1], P.cornerL, 62,
          'Back door, then all the way through to the empty corner.', function (court) { court.run([A_STEPS[1], A_STEPS[2]]); }),
        pickQ('You are 1. 2 is open on the back door. What do you do?', '1', snaps[2],
          ['Pass to 2 for the layup', 'Keep dribbling to the handoff', 'Pull up and shoot'],
          'Hit the cutter. A layup beats any handoff.', function (court) { court.load(snaps[1]); court.play(OPEN); }),
        tapQ('You are 4. 2 has cut through to the far corner. Tap where you take the handoff.', '4', snaps[3], [412, 236], 62,
          'Lift up out of the corner, toward the ball.', function (court) { court.play(A_STEPS[3]); }),
        tapQ('You are 1. You hand the ball to 4. Tap where you finish.', '1', snaps[4], P.cornerR, 62,
          'Hand off, roll to the rim, then fill the corner 4 left.', function (court) { court.play(A_STEPS[4]); }),
        pickQ('You are 4. You lift for the handoff and your defender jumps in front of you. What do you do?', '4', jamFrame,
          ['Go back door', 'Take the handoff anyway', 'Stop and stand still'],
          'Same rule as the wing. They take the ball away, you take the space behind them.', function (court) { court.load(snaps[3]); court.play(JAM); }),
        tapQ('You are 5. 4 is taking the ball to the top and 1 will lift out of the right corner. Tap your next spot.', '5', snaps[5], P.dunkR, 55,
          'Slide to the dunker spot on the new empty side.', function (court) { court.play(A_STEPS[5]); }),
        pickQ('You are 5. Where do you stay while Dribble at runs?', '5', START,
          ['In the dunker spot on the empty side', 'Under the hoop', 'Up at the elbow'],
          'Low and out of the cutter\'s way. When the empty corner moves, you move with it.')
      ];
    }, function () { c.empty(true); c.focus(me); show(k); });
    c.onTap(function (p) { if (quiz.active()) quiz.tap(p); });

    var shown = false;
    return { show: function () { if (!shown) { shown = true; show(-1); } } };
  }

  /* -------------------------------- Words -------------------------------- */
  function words(host) {
    var places = Object.keys(KINDS).map(function (k) { return { w: KINDS[k].name, d: KINDS[k].line, kids: true }; });
    var groups = [['Places', places], ['Moves', MOVES], ['Team words', TEAM]];
    var r = row(host, 'Show');
    var allW = btn('All words', '', r), kidW = btn('Kids words', '', r);
    var list = h('div', 'lg-wordlist', null, host);
    function draw(kids) {
      allW.setAttribute('aria-pressed', kids ? 'false' : 'true');
      kidW.setAttribute('aria-pressed', kids ? 'true' : 'false');
      list.textContent = '';
      groups.forEach(function (g) {
        var items = g[1].filter(function (x) { return !kids || x.kids; });
        if (!items.length) return;
        h('h3', '', g[0], list);
        var dl = h('dl', '', null, list);
        items.forEach(function (x) { h('dt', '', x.w, dl); h('dd', '', x.d, dl); });
      });
    }
    allW.addEventListener('click', function () { draw(false); });
    kidW.addEventListener('click', function () { draw(true); });
    draw(false);
  }

  /* -------------------------------- Boot --------------------------------- */
  function boot() {
    var root = document.getElementById('learn');
    if (!root || !document.createElementNS) return;
    root.classList.add('js');
    var levels = {
      'court': levelCourt(document.querySelector('#court .lg-host')),
      'rules': levelRules(document.querySelector('#rules .lg-host')),
      'dribble-at': levelAction(document.querySelector('#dribble-at .lg-host'))
    };
    words(document.getElementById('lg-words'));
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.lg-tab'));
    function open(name, scroll) {
      if (!levels[name]) name = 'court';
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-lv') === name;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      levels[name].show();
      if (scroll) document.querySelector('.lg-tabs').scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () {
        var name = t.getAttribute('data-lv');
        try { history.replaceState(null, '', '#' + name); } catch (e) {}
        open(name);
      });
      t.addEventListener('keydown', function (ev) {
        var d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        var n = tabs[(i + d + tabs.length) % tabs.length];
        n.focus(); n.click();
      });
    });
    window.addEventListener('hashchange', function () { open(location.hash.slice(1), true); });
    var start = location.hash.slice(1);
    open(start, !!levels[start]);
    paintBest();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
