// Leviathans -- the encounters on waves 20, 30, 40 and 50.
//
// These get the Kraken treatment: the camera pulls back, the fight has a shape
// that takes a while to read, and the ending leaves a remnant. Each one is
// built around a piece of math that the ordinary waves cannot teach, because
// the lesson is structural rather than arithmetic -- what halving looks like
// all the way down, what an equation actually balances, that one quantity has
// three names, and that the facts you keep missing are a real opponent.

import { TAU, clamp, rand, randInt } from '../../util.js';
import { Encounter } from './base.js';

// --- wave 20: The Hydra ----------------------------------------------------
//
// One head, one number. Solve it and it does not die -- it halves into two
// heads, and those halve again. You divide your way down a tree, and the tree
// is the boss's body: by the last generation the thing you are fighting fills
// the sky and every single problem on it is easy. That crescendo is the point.

// Three rows have to fit between the trunk and the dome at y=570. They did
// not: the first build hung the trunk at 300 and spaced rows 132 apart, which
// put the second generation at 714 -- under the planet. Every head below the
// line arrived the frame it was born, cost a core, and was removed without
// ever being answerable, so the fight deadlocked one solve in.
const ROW = 118;
const FIRST = 104;            // trunk to the first row

export class Hydra extends Encounter {
  constructor(x, y, wave) {
    super(x, y, wave);
    // Depth two is seven solves. Three is fifteen, which is a wave, not a
    // boss -- so depth grows only on the repeat pass at wave 60 and beyond.
    this.maxDepth = wave >= 60 ? 3 : 2;
    this.root = wave >= 60 ? 48 : 24;
    this.grown = 0;               // heads ever grown, which is what `spent` reads
    this.cut = 0;
    this.edges = [];              // {x0,y0,x1,y1,t} -- the branches, for the art
    this.seeded = false;
  }

  static get title() { return 'THE HYDRA'; }
  static get salvo() { return 2; }
  static get tagline() { return 'CUT IT IN HALF'; }
  static get zoom() { return 0.7; }
  static get originY() { return 108; }
  static get remnant() { return { glyph: '1', hue: 96 }; }

  get headTotal() { return (1 << (this.maxDepth + 1)) - 1; }
  get spent() { return this.seeded && this.grown >= this.headTotal && this.held.length === 0; }
  get left() { return this.headTotal - this.cut; }
  get total() { return this.headTotal; }

  _place(depth, slot) {
    const wide = 1 << depth;
    const span = 980;
    return {
      x: this.x + (slot - (wide - 1) / 2) * (span / Math.max(1, wide)),
      y: this.y + FIRST + depth * ROW,
    };
  }

  _head(api, value, depth, slot) {
    const p = this._place(depth, slot);
    const terminal = depth >= this.maxDepth;
    const b = api.demand({
      // A terminal head is not halved -- it is counted out, which is where the
      // division finally bottoms out in something a child can just see.
      prompt: terminal ? `${value} ÷ ${value}` : `${value} ÷ 2`,
      hint: terminal ? `${value} ÷ ${value} =` : `${value} ÷ 2 =`,
      answer: terminal ? 1 : value / 2,
      concept: 'division', op: '÷', a: value, b: terminal ? value : 2,
      mag: 26 + value, hue: 96 + depth * 14, size: 26, w: 118, h: 98,
    }, p.x, p.y);
    b.headValue = value;
    b.depth = depth;
    b.slot = slot;
    this.held.push(b);
    this.grown++;
    return b;
  }

  _solved(b) {
    this.cut++;
    this.hitFlash = 0.8;
    this._pending = this._pending || [];
    if (b.depth < this.maxDepth) {
      this._pending.push({ value: b.headValue / 2, depth: b.depth + 1, slot: b.slot * 2 });
      this._pending.push({ value: b.headValue / 2, depth: b.depth + 1, slot: b.slot * 2 + 1 });
    }
  }

  _fight(dt, api) {
    if (!this.seeded) {
      this._head(api, this.root, 0, 0);
      this.seeded = true;
      return;
    }
    // Growth is deferred by a frame so a head is never created inside the same
    // pass that removed its parent -- the list is being filtered underneath.
    if (this._pending && this._pending.length) {
      for (const p of this._pending) this._head(api, p.value, p.depth, p.slot);
      this._pending.length = 0;
    }
    // Heads hold station in their row and breathe.
    for (const b of this.held) {
      const p = this._place(b.depth, b.slot);
      b.x = p.x + Math.sin(this.t * 1.1 + b.slot) * 7;
      b.y = p.y + Math.cos(this.t * 1.4 + b.depth) * 6;
    }
  }

  _drawOpen(ctx) { super._drawOpen(ctx, 130); }

  _drawBody(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // Necks: from the trunk to every living head, through the parent slot, so
    // the branching structure of the division is the thing you are looking at.
    for (const b of this.held) {
      const parent = b.depth === 0
        ? { x: this.x, y: this.y + 40 }
        : this._place(b.depth - 1, b.slot >> 1);
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = `hsla(${96 + b.depth * 14 + pass * 20}, 90%, ${48 + this.hitFlash * 24}%, ${pass ? 0.35 : 0.75})`;
        ctx.lineWidth = (pass ? 5 : 13) / (1 + b.depth * 0.35);
        ctx.beginPath();
        ctx.moveTo(parent.x, parent.y);
        const mx = (parent.x + b.x) / 2 + Math.sin(this.t * 1.3 + b.slot) * 16;
        ctx.quadraticCurveTo(mx, (parent.y + b.y) / 2, b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // The trunk.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = `hsla(96, 55%, ${11 + this.hitFlash * 18}%, 0.95)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 132, 96, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 4;
    ctx.strokeStyle = `hsla(96, 100%, ${56 + this.hitFlash * 30}%, 0.9)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 132, 96, 0, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `hsla(${96 + i * 16}, 100%, 66%, ${0.36 - i * 0.07})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 132 - i * 22, 96 - i * 17, Math.sin(this.t * 0.5 + i) * 0.2, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// --- wave 30: The Balance --------------------------------------------------
//
// A beam across the whole sky with a pan hanging off each end. One pan holds a
// number, the other an expression with a hole in it. The beam physically tilts
// toward the heavy side and the tilt is the damage bar -- there is no readout,
// you take your health off the horizon. Nothing on screen represents the
// equation; the equation is the thing you are looking at.

const ARM = 380;
const LOAD = 0.115;           // tilt per second while it is out of balance
const LEVEL = 0.14;           // how close to level counts as level
const SHOVE = 0.26;           // tilt one answer takes off, net of the load

export class Balance extends Encounter {
  constructor(x, y, wave) {
    super(x, y, wave);
    this.solveTotal = 5;
    this.solved = 0;
    // Starts tipped, not level. At zero the armour is already off on the first
    // frame and the fight is over in two seconds.
    this.tilt = 0.62;
    this.shown = 0;             // the tilt actually drawn, eased
    this.crushT = 0;
    this.sinceSolve = 0;        // seconds of load to back out on the next answer
    this.side = 1;
  }

  static get title() { return 'THE BALANCE'; }
  static get tagline() { return 'HOLD IT LEVEL'; }
  static get coreHits() { return 3; }
  static get zoom() { return 0.7; }
  static get originY() { return 290; }
  static get remnant() { return { glyph: '=', hue: 42 }; }

  // The armour is the tilt itself. Solving levels the beam, but it starts
  // tipping again straight away -- so the goal is not "answer five things", it
  // is "get it level and be quick enough that it is still level". Holding the
  // horizon is what splits the fulcrum.
  // Zero *inside* the level band, not asymptotically approaching it. Scaled
  // against LEVEL the armour converged on 0.18 and never opened: each answer
  // takes a bite out of the tilt while LOAD keeps adding, so the two settle at
  // a small non-zero tilt. LEVEL already means "close enough counts as level";
  // this is the armour agreeing with it.
  get armour() {
    const a = Math.abs(this.tilt);
    return a <= LEVEL ? 0 : clamp((a - LEVEL) / (1 - LEVEL), 0, 1);
  }
  get spent() { return this.coreDone >= this.coreTotal; }
  get left() { return this.coreTotal - this.coreDone; }
  get total() { return this.coreTotal; }
  get pinned() { return Math.abs(this.tilt) >= 0.999; }

  // Cracked: it heaves over and the shoving starts again from the far side.
  _cracked() {
    this.tilt = this.side * 0.55;
    this.side = -this.side;
    this.sinceSolve = 0;
  }

  _core(api) {
    const eq = this._next(api);
    this.rhs = eq.rhs;
    return {
      prompt: eq.lhs, hint: eq.hint, answer: eq.answer,
      concept: 'equation', mag: 64, hue: 42, size: 34, w: 190, h: 130,
    };
  }

  _solved() {
    this.solved++;
    this.hitFlash = 1;
    // A fixed shove, plus back out everything the load piled on while the
    // player was reading. One answer is always the same amount of real
    // progress, whatever their tempo.
    //
    // This used to be `tilt *= 0.42`, and a proportional bite against a
    // constant load has an equilibrium: the load adds LOAD x T per answer and
    // the bite removes 58% of the tilt, so they settle at LOAD x T / 0.58.
    // Past about three quarters of a second per answer that sits above the
    // level band, the armour never reaches zero, the core never opens and the
    // Balance is simply unkillable -- measured at five minutes and still
    // fighting, with every core intact, for exactly the slower player this
    // game is for. Every other armoured boss shoves by a fixed step: a plate
    // of wall, an arm of orbit. This one now agrees with them.
    //
    // The load is still the pressure. Take long enough and the beam pins and
    // the low pan grinds on the dome, which costs cores -- a punishment, which
    // is what it was always meant to be, rather than a stalemate.
    const off = SHOVE + this.sinceSolve * LOAD;
    this.tilt = Math.sign(this.tilt) * Math.max(0, Math.abs(this.tilt) - off);
    this.sinceSolve = 0;
    this.crushT = 0;
  }

  // The equations come from the tier's own curriculum -- a missing addend at
  // grade 3, a two-step solve with negatives at grade 7 -- so the Balance
  // never has to know what grade it is being fought at. Every one of those
  // prompts is `lhs = rhs`, which is exactly the two pans.
  _next(api) {
    if (!this.steps || !this.steps.length) this.steps = api.equation();
    const step = this.steps.shift();
    const cut = step.prompt.indexOf('=');
    return {
      lhs: cut < 0 ? step.prompt : step.prompt.slice(0, cut).trim(),
      rhs: cut < 0 ? '' : step.prompt.slice(cut + 1).trim(),
      hint: step.hint,
      answer: step.answer,
    };
  }

  _fight(dt, api) {
    // Out of balance, it keeps going out of balance. This is the clock.
    this.tilt = clamp(this.tilt + this.side * LOAD * dt, -1, 1);
    this.sinceSolve += dt;
    this.shown += (this.tilt - this.shown) * Math.min(1, dt * 4);
    if (this.pinned) {
      this.crushT += dt;
      // Held all the way over, the low pan grinds on the dome.
      if (this.crushT > 1.6) { this.crushT = 0; api.hurt(); }
    }

    // Ordinary steps keep coming whatever the beat: they are how you level the
    // beam, so sealing them would leave no way to take the armour off.
    if (!this.held.filter((b) => !b.core).length && !this.spent) {
      const eq = this._next(api);
      this.rhs = eq.rhs;
      const b = api.demand({
        // The beast carries the left-hand side only; the right pan holds the
        // number. Put the whole equation on the beast and the pans become
        // decoration instead of the problem.
        prompt: eq.lhs, hint: eq.hint, answer: eq.answer,
        concept: 'equation', mag: 42 + Math.abs(parseInt(eq.rhs, 10) || 20),
        hue: 42, size: 32, w: 180, h: 120,
      }, this.x, this.y);
      this.held.push(b);
    }

    // The expression rides the pan it is weighing down; the core sits on the
    // fulcrum, which is the thing you levelled to get at it.
    const p = this._pan(-1);
    for (const b of this.held) {
      if (b.core) { b.x = this.x; b.y = this.y - 70; }
      else { b.x = p.x; b.y = p.y + 54; }
    }
  }

  _pan(side) {
    const a = this.shown * 0.3;
    return {
      x: this.x + side * ARM * Math.cos(a),
      y: this.y + side * ARM * Math.sin(a),
    };
  }

  _drawOpen(ctx) { super._drawOpen(ctx, 110); }

  _drawBody(ctx) {
    const l = this._pan(-1), r = this._pan(1);
    const stress = Math.abs(this.shown);
    const hue = 42 - stress * 34;

    ctx.save();
    // The column.
    ctx.fillStyle = 'hsla(42, 30%, 12%, 0.9)';
    ctx.beginPath();
    ctx.moveTo(this.x - 34, this.y + 190);
    ctx.lineTo(this.x + 34, this.y + 190);
    ctx.lineTo(this.x + 12, this.y);
    ctx.lineTo(this.x - 12, this.y);
    ctx.closePath();
    ctx.fill();

    // The beam.
    ctx.globalCompositeOperation = 'lighter';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = `hsla(${hue}, 100%, ${62 + this.hitFlash * 28}%, ${pass ? 0.35 : 0.95})`;
      ctx.lineWidth = pass ? 22 : 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
    }

    // Pans, hanging plumb whatever the beam does.
    for (const [p, label] of [[l, null], [r, this.rhs || '']]) {
      ctx.strokeStyle = `hsla(${hue}, 90%, 68%, 0.6)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + 54);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 62, p.y + 54);
      ctx.quadraticCurveTo(p.x, p.y + 96, p.x + 62, p.y + 54);
      ctx.stroke();
      if (label) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 46px "JetBrains Mono", ui-monospace, monospace';
        ctx.shadowColor = `hsla(${hue},100%,60%,0.9)`;
        ctx.shadowBlur = 22;
        ctx.fillStyle = '#fff6de';
        ctx.fillText(label, p.x, p.y + 62);
        ctx.restore();
      }
    }

    // The fulcrum, brighter the closer it is to level -- the one thing you are
    // trying to achieve, lit as a reward for approaching it.
    const level = 1 - stress;
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 60 + level * 40);
    g.addColorStop(0, `rgba(255,255,255,${0.35 + level * 0.6})`);
    g.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 60 + level * 40, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// --- wave 40: The Prism ----------------------------------------------------
//
// A crystal that refracts your shots away. It holds one quantity, shown only
// as a filled bar -- no numerals at all -- and each of its three facets wants
// that quantity written a different way: as a fraction, as a decimal, as a
// percent. Equivalence between the three is the thing children reliably do not
// internalise, and here it is literally three views of one light.

const VALUES = [
  { p: 1, q: 2 }, { p: 1, q: 4 }, { p: 3, q: 4 }, { p: 1, q: 5 },
  { p: 2, q: 5 }, { p: 3, q: 5 }, { p: 4, q: 5 }, { p: 1, q: 10 },
  { p: 3, q: 10 }, { p: 7, q: 10 }, { p: 1, q: 20 }, { p: 3, q: 20 },
];

const FACETS = [
  { key: 'fraction', label: 'AS A FRACTION' },
  { key: 'decimal', label: 'AS A DECIMAL' },
  { key: 'percent', label: 'AS A PERCENT' },
];

export class Prism extends Encounter {
  constructor(x, y, wave) {
    super(x, y, wave);
    this.valueTotal = 2;
    this.done = 0;
    this.clear = [0, 0, 0];       // how clear each facet is, 0..1
    this.spin = 0;
    this._pick();
  }

  static get title() { return 'THE PRISM'; }
  static get salvo() { return 3; }
  static get tagline() { return 'ONE AMOUNT, THREE NAMES'; }
  static get zoom() { return 0.76; }
  static get originY() { return 290; }
  static get remnant() { return { glyph: '½', hue: 320 }; }

  get spent() { return this.done >= this.valueTotal; }
  get left() { return this.valueTotal - this.done; }
  get total() { return this.valueTotal; }

  _pick() {
    const v = VALUES[randInt(0, VALUES.length - 1)];
    this.p = v.p; this.q = v.q;
    this.value = v.p / v.q;
    this.clear = [0, 0, 0];
    this.taken = new Set();
  }

  _solved(b) {
    this.taken.add(b.facet);
    this.clear[FACETS.findIndex((f) => f.key === b.facet)] = 1;
    this.hitFlash = 1;
    if (this.taken.size >= 3) {
      this.done++;
      if (!this.spent) this._pick();
    }
  }

  _spec(facet) {
    const v = this.value;
    if (facet === 'fraction') {
      return {
        answer: `${this.p}/${this.q}`,
        // Any equivalent fraction: insisting on lowest terms would fail a
        // child who correctly wrote 2/4 for a bar that is half full.
        accept: (raw) => {
          const m = /^(\d+)\s*\/\s*(\d+)$/.exec(raw);
          return Boolean(m) && Number(m[2]) !== 0 && Math.abs(Number(m[1]) / Number(m[2]) - v) < 1e-9;
        },
      };
    }
    if (facet === 'decimal') {
      return {
        answer: String(+v.toFixed(4)),
        accept: (raw) => Number.isFinite(Number(raw)) && raw !== '' && Math.abs(Number(raw) - v) < 1e-6,
      };
    }
    return {
      answer: String(+(v * 100).toFixed(2)),
      accept: (raw) => {
        const s = raw.replace(/%$/, '').trim();
        return s !== '' && Number.isFinite(Number(s)) && Math.abs(Number(s) - v * 100) < 1e-6;
      },
    };
  }

  _fight(dt, api) {
    this.spin += dt * 0.25;
    for (let i = 0; i < 3; i++) if (this.clear[i] > 0) this.clear[i] = Math.max(0.35, this.clear[i]);

    for (const f of FACETS) {
      if (this.taken.has(f.key)) continue;
      if (this.held.some((b) => b.facet === f.key)) continue;
      const i = FACETS.findIndex((x) => x.key === f.key);
      const a = this.spin + (i / 3) * TAU;
      const s = this._spec(f.key);
      const b = api.demand({
        prompt: f.label, hint: f.label.toLowerCase(),
        answer: s.answer, accept: s.accept,
        concept: 'equivalence', mag: 54,
        hue: 320 + i * 20, size: 20, w: 200, h: 96,
      }, this.x + Math.cos(a) * 300, this.y + Math.sin(a) * 200);
      b.facet = f.key;
      b.facetIndex = i;
      this.held.push(b);
    }

    for (const b of this.held) {
      const a = this.spin + (b.facetIndex / 3) * TAU;
      b.x = this.x + Math.cos(a) * 300;
      b.y = this.y + Math.sin(a) * 200;
    }
  }

  _drawOpen(ctx) { super._drawOpen(ctx, 140); }

  _drawBody(ctx) {
    const R = 150;
    ctx.save();
    ctx.translate(this.x, this.y);

    // The crystal: a triangle, one edge per facet.
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * TAU;
      const px = Math.cos(a) * R, py = Math.sin(a) * R;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `hsla(320, 45%, ${10 + this.hitFlash * 14}%, 0.9)`;
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    // Each facet edge lights as its notation is answered.
    for (let i = 0; i < 3; i++) {
      const a0 = -Math.PI / 2 + (i / 3) * TAU;
      const a1 = -Math.PI / 2 + ((i + 1) / 3) * TAU;
      const lit = this.clear[i];
      ctx.strokeStyle = `hsla(${320 + i * 20}, 100%, ${58 + lit * 36}%, ${0.4 + lit * 0.6})`;
      ctx.lineWidth = 5 + lit * 6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * R, Math.sin(a0) * R);
      ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
      ctx.stroke();
    }

    // The quantity, as a bar and nothing else. No numerals: reading the amount
    // off the picture is the first half of the problem.
    const bw = 176, bh = 46;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(6,4,14,0.9)';
    ctx.fillRect(-bw / 2, -bh / 2 + 14, bw, bh);
    ctx.fillStyle = 'hsla(320, 100%, 72%, 0.92)';
    ctx.fillRect(-bw / 2, -bh / 2 + 14, bw * this.value, bh);
    ctx.strokeStyle = 'hsla(320, 100%, 80%, 0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-bw / 2, -bh / 2 + 14, bw, bh);
    // Tick marks at every qth division, so the bar can actually be read.
    ctx.beginPath();
    for (let i = 1; i < this.q; i++) {
      const tx = -bw / 2 + (bw * i) / this.q;
      ctx.moveTo(tx, -bh / 2 + 14);
      ctx.lineTo(tx, bh / 2 + 14);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

// --- wave 50: The Echo -----------------------------------------------------
//
// A dark mirror of the player's own planet, hanging upside down at the top of
// the sky, and its attacks are their own missed facts pulled live out of the
// skill table. It knows the weak spots because it is the weak spots. Solve one
// and it is burned out of the mirror permanently; every other boss is a thing
// that arrived, this one is a thing that accumulated.

const OPS = {
  '×': (a, b) => a * b,
  '+': (a, b) => a + b,
  '−': (a, b) => a - b,
  '÷': (a, b) => (b ? a / b : 0),
};

export class Echo extends Encounter {
  constructor(x, y, wave, facts = []) {
    super(x, y, wave);
    // Only facts with a usable pair and a whole answer; a mirror made of
    // nothing is the correct outcome for a player who never misses.
    this.facts = facts
      .filter((f) => f && Number.isFinite(f.a) && Number.isFinite(f.b) && OPS[f.op || '×'])
      .filter((f) => Number.isInteger(OPS[f.op || '×'](f.a, f.b)))
      .slice(0, 6);
    this.factTotal = Math.max(3, this.facts.length);
    this.burned = 0;
    this.spawned = 0;
    this.glare = 0;
  }

  static get title() { return 'THE ECHO'; }
  static get salvo() { return 3; }
  static get tagline() { return 'EVERY FACT YOU MISSED'; }
  static get zoom() { return 0.72; }
  static get originY() { return 220; }
  static get remnant() { return { glyph: '◐', hue: 260 }; }

  get spent() { return this.spawned >= this.factTotal && this.held.length === 0; }
  get left() { return this.factTotal - this.burned; }
  get total() { return this.factTotal; }

  _solved() {
    this.burned++;
    this.glare = 1;
    this.hitFlash = 1;
  }

  _fight(dt, api) {
    this.glare = Math.max(0, this.glare - dt * 1.6);
    while (this.held.length < 2 && this.spawned < this.factTotal) {
      const f = this.facts[this.spawned % Math.max(1, this.facts.length)];
      let b;
      if (f) {
        const op = f.op || '×';
        b = api.demand({
          prompt: `${f.a} ${op} ${f.b}`,
          answer: OPS[op](f.a, f.b),
          concept: 'echo', a: f.a, b: f.b, op,
          mag: 44 + Math.abs(OPS[op](f.a, f.b)), hue: 260, size: 30, w: 160, h: 110,
        }, this.x + rand(340, -340), this.y + 130 + rand(60, -60));
      } else {
        // A player with a clean table still gets a fight, just not a personal
        // one. Falling back to the curriculum beats an empty encounter.
        b = api.curriculum(this.x + rand(340, -340), this.y + 130);
        if (!b) break;
      }
      this.held.push(b);
      this.spawned++;
    }
    // Held, not free -- it drifts them about but never lets one wander off the
    // side or down onto the dome, which an unbounded drift eventually does.
    for (const b of this.held) {
      b.y = clamp(b.y + Math.sin(this.t * 1.2 + b.id) * 26 * dt, this.y + 40, this.y + 250);
      b.x = clamp(b.x + Math.cos(this.t * 0.8 + b.id) * 34 * dt, 160, 1120);
    }
    // And they push each other apart. Drifting independently, two of them
    // eventually share a spot and their labels overlap into one unreadable
    // line -- which on this boss is the entire content.
    for (let i = 0; i < this.held.length; i++) {
      for (let j = i + 1; j < this.held.length; j++) {
        const a = this.held[i], c = this.held[j];
        const gap = a.x - c.x;
        const want = 210;
        if (Math.abs(gap) < want) {
          const push = ((want - Math.abs(gap)) / 2) * (gap < 0 ? -1 : 1);
          a.x = clamp(a.x + push, 160, 1120);
          c.x = clamp(c.x - push, 160, 1120);
        }
      }
    }
  }

  _drawOpen(ctx) { super._drawOpen(ctx, 150); }

  _drawBody(ctx) {
    // An inverted planet and dome: the player's own silhouette, upside down.
    const R = 620, DR = 680;
    const cy = this.y - R + 96;   // curve away upward, mirroring the ground
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, cy, R, 0, TAU);
    ctx.fillStyle = 'rgba(7,5,16,0.96)';
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    const rim = ctx.createRadialGradient(this.x, cy, R - 30, this.x, cy, R + 22);
    rim.addColorStop(0, 'hsla(260, 100%, 60%, 0)');
    rim.addColorStop(0.7, `hsla(260, 100%, 62%, ${0.26 + this.glare * 0.4})`);
    rim.addColorStop(1, 'hsla(260, 100%, 70%, 0)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(this.x, cy, R + 24, 0, TAU);
    ctx.fill();

    // Its dome: one dark plate per fact still in it, going out as they burn.
    const from = Math.PI * 0.34, to = Math.PI * 0.66;
    for (let i = 0; i < this.factTotal; i++) {
      const a = from + ((to - from) * (i + 0.5)) / this.factTotal;
      const px = this.x + Math.cos(a) * DR;
      const py = cy + Math.sin(a) * DR;
      const gone = i < this.burned;
      ctx.fillStyle = gone
        ? 'hsla(260, 30%, 40%, 0.18)'
        : `hsla(260, 100%, ${58 + this.hitFlash * 24}%, 0.72)`;
      ctx.beginPath();
      ctx.arc(px, py, gone ? 8 : 15, 0, TAU);
      ctx.fill();
    }

    // Dead city lights on the mirror limb -- it is inhabited by the mistakes.
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * (0.28 + (i / 26) * 0.44);
      const d = R * (0.985 + Math.sin(i * 3.1) * 0.012);
      ctx.fillStyle = `hsla(272, 90%, 70%, ${0.1 + Math.abs(Math.sin(this.t * 1.4 + i)) * 0.22})`;
      ctx.beginPath();
      ctx.arc(this.x + Math.cos(a) * d, cy + Math.sin(a) * d, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
