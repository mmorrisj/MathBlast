// Wardens -- the encounters on waves 5, 15, 25, 35 and 45.
//
// A boss every five waves means one roughly every three and a half minutes,
// and if all ten are full set pieces the game stops being a math game and
// becomes a boss rush. So the odd slots are deliberately smaller: one idea,
// one screen, no orbit and no spectacle, over in well under a minute. They
// test something the player already has. The Leviathans on the tens are what
// introduce new ground.

import { TAU, clamp, rand, randInt, roundRect } from '../../util.js';
import { theme } from '../../theme.js';
import { Encounter } from './base.js';

// --- wave 5: The Bulwark ---------------------------------------------------
//
// The first big thing anyone sees, at the point where a player is still on
// single digits -- so it teaches no new math on purpose. What it teaches is
// that pace is a weapon: the wall is always coming down, and the only thing
// that pushes it back is answering.

const SLOTS = 4;
const CREEP = 15;             // px/s the wall descends, always
const PUSH = 62;              // px a broken plate shoves it back

export class Bulwark extends Encounter {
  constructor(x, y, wave) {
    super(x, y, wave);
    this.plateTotal = 6 + Math.floor(wave / 20);
    this.spawned = 0;
    this.broken = 0;
    this.y0 = y;
    this.shove = 0;             // eases the push-back rather than teleporting
  }

  static get title() { return 'THE BULWARK'; }
  static get tagline() { return 'BREAK IT BEFORE IT LANDS'; }
  static get zoom() { return 0.84; }
  static get remnant() { return { glyph: '▣', hue: 32 }; }

  get spent() { return this.spawned >= this.plateTotal && this.held.length === 0; }
  get left() { return this.plateTotal - this.broken; }
  get total() { return this.plateTotal; }

  _solved() {
    this.broken++;
    this.shove = PUSH;
    this.hitFlash = 1;
  }

  _fight(dt, api) {
    // Always coming. This is the whole encounter: a clock you can push on.
    this.y += CREEP * dt;
    if (this.shove > 0) {
      const step = Math.min(this.shove, 260 * dt);
      this.y -= step;
      this.shove -= step;
    }
    this.y = Math.max(this.y0 - 60, this.y);

    while (this.held.length < SLOTS && this.spawned < this.plateTotal) {
      const b = api.curriculum(this.x, this.y);
      if (!b) break;
      this.held.push(b);
      this.spawned++;
    }

    // Plates ride the wall. They descend with it, so a wall that reaches the
    // dome does its damage through the ordinary arrival path -- the plates
    // land, and landing is already something the game knows how to punish.
    const span = 190;
    this.held.forEach((b, i) => {
      const n = Math.max(1, this.held.length);
      b.x = this.x + (i - (n - 1) / 2) * span;
      b.y = this.y + Math.sin(this.t * 2 + i) * 4;
    });
  }

  _drawOpen(ctx) { super._drawOpen(ctx, 120); }

  _drawBody(ctx) {
    const w = 900, h = 116;
    ctx.save();
    ctx.translate(this.x, this.y);
    // The slab.
    ctx.fillStyle = `hsla(${this.hue}, 45%, ${10 + this.hitFlash * 16}%, 0.94)`;
    roundRect(ctx, -w / 2, -h / 2, w, h, 16);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = `hsla(${this.hue}, 100%, ${56 + this.hitFlash * 30}%, 0.9)`;
    roundRect(ctx, -w / 2, -h / 2, w, h, 16);
    ctx.stroke();

    // Rivet courses, so it reads as armour rather than a bar.
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `hsla(${this.hue + 20}, 100%, 70%, 0.35)`;
    for (let i = 0; i < 18; i++) {
      const rx = -w / 2 + 26 + i * ((w - 52) / 17);
      for (const ry of [-h / 2 + 14, h / 2 - 14]) {
        ctx.beginPath();
        ctx.arc(rx, ry, 3, 0, TAU);
        ctx.fill();
      }
    }
    // A hot underside: the edge that is going to hit the dome.
    const g = ctx.createLinearGradient(0, h / 2 - 22, 0, h / 2 + 26);
    g.addColorStop(0, `hsla(${18}, 100%, 60%, 0.5)`);
    g.addColorStop(1, 'hsla(12,100%,55%,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, h / 2 - 22, w, 48);
    ctx.restore();
  }
}

// --- wave 15: The Twins ----------------------------------------------------
//
// Two hulls, one health pool. They hold different expressions with the same
// answer, so the fight is entirely about spotting equivalence -- and if you
// only kill one, the other heals it back. This is the cheapest encounter in
// the game to build and the one with the best math payoff: nothing else makes
// `3 x 8` and `6 x 4` feel like the same object.

const LINK = 3.4;             // seconds to bring the second one down
const GAP = 250;

// Two different expressions with the same value. Division and the two
// additive forms always exist, so this never fails to find a pair.
export function twinPair(wave) {
  const hi = clamp(8 + wave, 12, 90);
  const n = randInt(6, hi);
  const forms = [];
  const p = randInt(1, n - 1);
  forms.push({ text: `${p} + ${n - p}`, a: p, b: n - p, op: '+' });
  const q = randInt(2, 9);
  forms.push({ text: `${n + q} − ${q}`, a: n + q, b: q, op: '−' });
  const k = randInt(2, 9);
  forms.push({ text: `${n * k} ÷ ${k}`, a: n * k, b: k, op: '÷' });
  for (let d = 2; d <= 12; d++) {
    if (n % d === 0 && n / d <= 12 && n / d > 1) {
      forms.push({ text: `${d} × ${n / d}`, a: d, b: n / d, op: '×' });
      break;
    }
  }
  // Prefer the multiplication form when there is one -- it is the pairing
  // worth teaching -- but never show the same shape twice.
  const pick = forms.splice(forms.length > 3 ? 3 : randInt(0, forms.length - 1), 1)[0];
  const other = forms[randInt(0, forms.length - 1)];
  return { n, forms: [pick, other] };
}

export class Twins extends Encounter {
  constructor(x, y, wave) {
    super(x, y, wave);
    this.pairTotal = 3;
    this.cleared = 0;
    this.linkT = 0;             // counting down while one twin is down
    this.widow = null;          // the one still standing
    this.fallen = null;         // the form we have to put back if time runs out
    this.pulse = 0;
    this.settled = false;       // this pair has already been counted
  }

  static get title() { return 'THE TWINS'; }
  static get salvo() { return 2; }
  static get tagline() { return 'SAME ANSWER, BOTH AT ONCE'; }
  static get zoom() { return 0.84; }
  static get remnant() { return { glyph: '=', hue: 286 }; }

  get spent() { return this.cleared >= this.pairTotal; }
  get left() { return this.pairTotal - this.cleared; }
  get total() { return this.pairTotal; }

  _spawnPair(api) {
    const { n, forms } = twinPair(this.wave);
    this.value = n;
    forms.forEach((f, i) => {
      const b = api.demand({
        prompt: f.text, hint: `${f.text} =`, answer: n, concept: 'twins',
        mag: 34 + n, a: f.a, b: f.b, op: f.op, hue: theme.boss + i * 26, size: 30, w: 150, h: 110,
      }, this.x + (i ? GAP : -GAP), this.y);
      b.twin = i;
      this.held.push(b);
    });
    this.settled = false;
  }

  _solved(b) {
    // Both can fall in the same frame -- one shot each, landing together --
    // and then this runs twice with an already-empty list. Without the guard
    // that pair counts for two and the fight ends a pair early.
    if (this.settled) return;
    if (this.held.length === 1) {
      // First one down: the clock starts, and the survivor knows it.
      this.widow = this.held[0];
      this.fallen = { prompt: b.spec.prompt, a: b.a, bb: b.b, op: b.spec.op, hue: b.hue, twin: b.twin };
      this.linkT = LINK;
    } else if (this.held.length === 0) {
      // Both inside the window.
      this.settled = true;
      this.cleared++;
      this.widow = null;
      this.fallen = null;
      this.linkT = 0;
      this.hitFlash = 1;
      this.pulse = 1;
    }
  }

  _fight(dt, api) {
    this.pulse = Math.max(0, this.pulse - dt * 2);
    if (!this.held.length && !this.spent) { this._spawnPair(api); return; }

    if (this.linkT > 0) {
      this.linkT -= dt;
      if (this.linkT <= 0 && this.fallen) {
        // It healed. The same expression comes back, and nothing was gained.
        const f = this.fallen;
        const b = api.demand({
          prompt: f.prompt, hint: `${f.prompt} =`, answer: this.value, concept: 'twins',
          mag: 34 + this.value, a: f.a, b: f.bb, op: f.op, hue: f.hue, size: 30, w: 150, h: 110,
        }, this.x + (f.twin ? GAP : -GAP), this.y);
        b.twin = f.twin;
        this.held.push(b);
        this.fallen = null;
        this.widow = null;
        api.hurt();
      }
    }

    this.held.forEach((b) => {
      const side = b.twin ? 1 : -1;
      b.x = this.x + side * GAP + Math.sin(this.t * 1.6) * 8 * side;
      b.y = this.y + Math.cos(this.t * 1.3 + b.twin) * 10;
    });
  }

  _drawOpen(ctx) { super._drawOpen(ctx, 110); }

  _drawBody(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // The link: a bar between them that is the shared health pool. It runs
    // hot and short while one is down and the clock is going.
    const urgent = this.linkT > 0 ? clamp(1 - this.linkT / LINK, 0, 1) : 0;
    const hue = urgent ? 12 + urgent * 26 : this.hue + 30;
    for (let band = 0; band < 3; band++) {
      ctx.strokeStyle = `hsla(${hue}, 100%, ${64 + band * 10}%, ${(0.5 - band * 0.13) * (0.5 + urgent * 0.5 + this.pulse * 0.5)})`;
      ctx.lineWidth = (16 - band * 5) * (1 + urgent * 0.6 + this.pulse);
      ctx.beginPath();
      const sag = 26 - urgent * 22;
      ctx.moveTo(this.x - GAP, this.y);
      ctx.quadraticCurveTo(this.x, this.y + sag, this.x + GAP, this.y);
      ctx.stroke();
    }

    // The countdown, drawn as the bar draining from both ends inward.
    if (this.linkT > 0) {
      const k = clamp(this.linkT / LINK, 0, 1);
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + urgent * 0.4})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(this.x - GAP * k, this.y + 13);
      ctx.lineTo(this.x + GAP * k, this.y + 13);
      ctx.stroke();
    }

    // A knot at the centre holding the shared value out of sight.
    const r = 34 + this.pulse * 20;
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    g.addColorStop(0, `hsla(${hue}, 100%, 80%, ${0.7 + this.pulse * 0.3})`);
    g.addColorStop(1, `hsla(${hue}, 100%, 55%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// --- wave 25: The Remainder ------------------------------------------------
//
// A number, and you fire divisors at it. Get one that divides evenly and it
// cleaves into that many equal glowing slices. Get one that does not and the
// leftover breaks off and comes at you -- so a wrong guess literally makes
// your own next problem. Teaches factors and divisibility better than a
// worksheet, because being wrong has a shape.

const DIVISORS_WANTED = 4;

function divisorTarget(wave) {
  // Enough proper divisors to ask for four of them, and small enough to read.
  const pool = [24, 36, 48, 60, 72, 96, 120, 144, 180, 240];
  const i = clamp(Math.floor((wave - 20) / 10), 0, pool.length - 1);
  return pool[randInt(Math.max(0, i - 1), Math.min(pool.length - 1, i + 2))];
}

export class Remainder extends Encounter {
  constructor(x, y, wave) {
    super(x, y, wave);
    this.n = divisorTarget(wave);
    this.found = [];
    this.slices = [];           // one wedge per divisor found, for the art
    this.wobble = 0;
  }

  static get title() { return 'THE REMAINDER'; }
  static get salvo() { return 2; }
  static get tagline() { return 'DIVIDE IT CLEAN'; }
  static get zoom() { return 0.86; }
  static get remnant() { return { glyph: '÷', hue: 148 }; }

  get spent() { return this.found.length >= DIVISORS_WANTED; }
  get left() { return DIVISORS_WANTED - this.found.length; }
  get total() { return DIVISORS_WANTED; }

  _solved(b) {
    const d = b.lastValue;
    if (d != null && !this.found.includes(d)) {
      this.found.push(d);
      this.slices.push({ d, t: 0 });
    }
    this.hitFlash = 1;
  }

  // A guess that leaves something over. The leftover is the punishment.
  onWrong(value, api) {
    const d = parseInt(value, 10);
    if (!Number.isFinite(d) || d <= 0) return;
    const rem = this.n % d;
    this.wobble = 1;
    api.fragment(this.n - rem * Math.floor(this.n / d) >= 0 ? rem : rem, this.x + rand(300, -300));
  }

  _demand(api) {
    const taken = this.found.slice();
    const n = this.n;
    const b = api.demand({
      prompt: `${n} ÷ ?`,
      hint: `a factor of ${n}`,
      // Any proper divisor still unclaimed. Shown as the smallest one left so
      // the multiple-choice list has something true in it.
      answer: (() => {
        for (let d = 2; d < n; d++) if (n % d === 0 && !taken.includes(d)) return d;
        return 2;
      })(),
      accept: (raw) => {
        const d = parseInt(raw, 10);
        return Number.isFinite(d) && d > 1 && d < n && n % d === 0 && !taken.includes(d);
      },
      concept: 'division', op: '÷', a: n, mag: 40 + n / 2,
      hue: 148, size: 34, w: 190, h: 120,
    }, this.x, this.y + 4);
    this.held.push(b);
  }

  _fight(dt, api) {
    this.wobble = Math.max(0, this.wobble - dt * 1.8);
    for (const s of this.slices) s.t += dt;
    if (!this.held.length && !this.spent) this._demand(api);
    this.held.forEach((b) => {
      b.x = this.x + Math.sin(this.t * 1.4) * 10;
      b.y = this.y + 4;
    });
  }

  _drawOpen(ctx) { super._drawOpen(ctx, 150); }

  _drawBody(ctx) {
    const R = 150;
    const wob = Math.sin(this.t * 22) * this.wobble * 7;
    ctx.save();
    ctx.translate(this.x + wob, this.y);

    // The body of the number.
    ctx.fillStyle = `hsla(148, 55%, ${9 + this.hitFlash * 16}%, 0.95)`;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();

    // Every divisor found carves the disc into that many equal wedges, all at
    // once -- the picture of what dividing evenly actually means.
    ctx.globalCompositeOperation = 'lighter';
    this.slices.forEach((s, si) => {
      const grow = clamp(s.t * 2.4, 0, 1);
      const rr = R * (0.34 + si * 0.17);
      ctx.strokeStyle = `hsla(${148 + si * 22}, 100%, 66%, ${0.5 * grow})`;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < s.d; i++) {
        const a = (i / s.d) * TAU + this.t * (0.12 + si * 0.05);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (rr - 26), Math.sin(a) * (rr - 26));
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU * grow);
      ctx.stroke();
    });

    ctx.lineWidth = 4;
    ctx.strokeStyle = `hsla(148, 100%, ${58 + this.hitFlash * 28}%, 0.9)`;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // The number itself, big, because it is the boss.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 78px "JetBrains Mono", ui-monospace, monospace';
    ctx.shadowColor = 'hsla(148,100%,60%,0.9)';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#eafff4';
    ctx.fillText(String(this.n), this.x + wob, this.y - R - 52);
    ctx.restore();

    // What has already been claimed, so the player can see what not to repeat.
    if (this.found.length) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 22px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = 'hsla(148,60%,72%,0.72)';
      ctx.fillText(this.found.join('   '), this.x, this.y + R + 40);
      ctx.restore();
    }
  }
}

// --- wave 35: The Cipher ---------------------------------------------------
//
// No problem is given. Only clues -- even, between twenty and forty, a
// multiple of seven -- one tumbler ring each. Every guess turns the rings it
// satisfies, so a wrong answer is information rather than a penalty. The only
// encounter in the game that rewards reasoning over computation.

function secretFor(wave) {
  const hi = clamp(30 + wave, 40, 99);
  for (let tries = 0; tries < 200; tries++) {
    const s = randInt(12, hi);
    const k = randInt(3, 9);
    if (s % k !== 0) continue;
    const lo = Math.max(2, s - randInt(6, 18));
    const hiR = Math.min(hi + 10, s + randInt(6, 18));
    const clues = [
      { text: s % 2 === 0 ? 'EVEN' : 'ODD', ok: (v) => v % 2 === (s % 2) },
      { text: `${lo} TO ${hiR}`, ok: (v) => v >= lo && v <= hiR },
      { text: `MULTIPLE OF ${k}`, ok: (v) => v % k === 0 },
    ];
    // Only worth asking if the clues pin down exactly one number.
    let hits = 0;
    for (let v = 2; v <= hi + 10; v++) if (clues.every((c) => c.ok(v))) hits++;
    if (hits === 1) return { secret: s, clues };
  }
  // Fallback that is always unique: the clues describe one number outright.
  return { secret: 24, clues: [
    { text: 'EVEN', ok: (v) => v % 2 === 0 },
    { text: '20 TO 26', ok: (v) => v >= 20 && v <= 26 },
    { text: 'MULTIPLE OF 8', ok: (v) => v % 8 === 0 },
  ] };
}

export class Cipher extends Encounter {
  constructor(x, y, wave) {
    super(x, y, wave);
    this.lockTotal = 2;
    this.opened = 0;
    this.rings = [0, 0, 0];       // how lit each tumbler is, 0..1
    this.spin = [0, 0, 0];
    this._newLock();
  }

  static get title() { return 'THE CIPHER'; }
  static get salvo() { return 2; }
  static get tagline() { return 'WORK OUT WHAT IT IS'; }
  static get zoom() { return 0.86; }
  static get remnant() { return { glyph: '?', hue: 268 }; }

  get spent() { return this.opened >= this.lockTotal; }
  get left() { return this.lockTotal - this.opened; }
  get total() { return this.lockTotal; }

  _newLock() {
    const { secret, clues } = secretFor(this.wave);
    this.secret = secret;
    this.clues = clues;
    this.rings = [0, 0, 0];
  }

  _solved() {
    this.opened++;
    this.hitFlash = 1;
    this.rings = [1, 1, 1];
    if (!this.spent) this._newLock();
  }

  // A guess that is not the secret still turns whichever tumblers it fits.
  // Being wrong here is how you find out what you know.
  onWrong(value) {
    const v = parseInt(value, 10);
    if (!Number.isFinite(v)) return;
    this.clues.forEach((c, i) => { if (c.ok(v)) this.rings[i] = 1; });
  }

  _fight(dt, api) {
    for (let i = 0; i < 3; i++) {
      this.spin[i] += dt * (0.3 + i * 0.22) * (1 + this.rings[i] * 2);
      if (this.rings[i] > 0) this.rings[i] = Math.max(0, this.rings[i] - dt * 0.32);
    }
    if (!this.held.length && !this.spent) {
      const b = api.demand({
        prompt: this.clues.map((c) => c.text).join('  ·  '),
        hint: 'the number',
        answer: this.secret,
        concept: 'number-sense', mag: 60,
        hue: 268, size: 22, w: 430, h: 120,
      }, this.x, this.y);
      this.held.push(b);
    }
    this.held.forEach((b) => { b.x = this.x; b.y = this.y + 200; });
  }

  _drawOpen(ctx) { super._drawOpen(ctx, 130); }

  _drawBody(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // The vault face.
    ctx.fillStyle = `hsla(268, 40%, ${9 + this.hitFlash * 14}%, 0.95)`;
    ctx.beginPath();
    ctx.arc(0, 0, 140, 0, TAU);
    ctx.fill();

    // Three tumbler rings, one per clue. A ring that a guess satisfied lights
    // and spins up -- that is the whole feedback channel.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const r = 58 + i * 30;
      const lit = this.rings[i];
      ctx.strokeStyle = `hsla(${268 + i * 16}, 100%, ${58 + lit * 34}%, ${0.4 + lit * 0.55})`;
      ctx.lineWidth = 6 + lit * 5;
      // Notched, so the rotation is visible.
      for (let s = 0; s < 6; s++) {
        const a0 = this.spin[i] + (s / 6) * TAU;
        ctx.beginPath();
        ctx.arc(0, 0, r, a0, a0 + TAU / 9);
        ctx.stroke();
      }
    }
    ctx.restore();

    // The clues, above the vault, in the order of the rings.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 20px "JetBrains Mono", ui-monospace, monospace';
    this.clues.forEach((c, i) => {
      const lit = this.rings[i];
      ctx.fillStyle = `hsla(${268 + i * 16}, 90%, ${64 + lit * 30}%, ${0.55 + lit * 0.45})`;
      ctx.fillText(c.text, this.x, this.y - 190 + i * 26);
    });
    ctx.restore();
  }
}

// --- wave 45: The Nought ---------------------------------------------------
//
// It arrives and inverts everything inside its radius: the sky, the dome, the
// beasts, the colour of the light. You fight it by adding back to zero. The
// scariest-looking thing in the game, and it sits immediately before the Echo,
// which is the most personal.

export class Nought extends Encounter {
  constructor(x, y, wave) {
    super(x, y, wave);
    this.zeroTotal = 5;
    this.zeroed = 0;
    this.spawned = 0;
    this.field = 0;             // how far the inversion has spread, 0..1
  }

  static get title() { return 'THE NOUGHT'; }
  static get salvo() { return 3; }
  static get tagline() { return 'BRING IT BACK TO ZERO'; }
  static get zoom() { return 0.8; }
  static get remnant() { return { glyph: '0', hue: 210 }; }

  get spent() { return this.zeroed >= this.zeroTotal; }
  get left() { return this.zeroTotal - this.zeroed; }
  get total() { return this.zeroTotal; }
  // How much of the screen it is currently inverting, for the render pass.
  get invertRadius() { return this.field * 520 * (1 - this.open); }

  _solved() {
    this.zeroed++;
    this.hitFlash = 1;
    this.field = Math.max(0, this.field - 0.24);
  }

  _fight(dt, api) {
    // It spreads while you leave it alone and retreats each time you cancel
    // something out, so the screen itself is the health bar.
    this.field = clamp(this.field + dt * 0.075, 0, 1);
    this.x += Math.sin(this.t * 0.7 + this.drift) * 22 * dt;

    while (this.held.length < 2 && this.spawned < this.zeroTotal) {
      // Cancel to zero: some ask for the additive inverse, some for the
      // missing term. Both are the same idea from opposite sides.
      const v = randInt(2, clamp(6 + this.wave, 9, 40)) * (Math.random() < 0.5 ? -1 : 1);
      const flip = Math.random() < 0.5;
      const shown = flip ? `? + ${v < 0 ? `(${v})` : v}` : `${v < 0 ? `(${v})` : v} + ?`;
      const b = api.demand({
        prompt: `${shown} = 0`,
        hint: `${shown} = 0`,
        answer: -v,
        concept: 'integer', op: '+', a: v, b: 0,
        mag: 36 + Math.abs(v), hue: 210, size: 30, w: 190, h: 110,
      }, this.x + rand(260, -260), this.y + 150 + rand(60, -60));
      this.held.push(b);
      this.spawned++;
    }

    this.held.forEach((b, i) => {
      b.y += Math.sin(this.t * 1.5 + i) * 8 * dt;
    });
  }

  _drawOpen(ctx) { super._drawOpen(ctx, 120); }

  _drawBody(ctx) {
    const r = this.invertRadius;
    // The inversion itself. 'difference' against white is a true colour
    // inversion, so this is not a tinted overlay -- everything under the disc
    // really is its own opposite.
    if (r > 4) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.72, 'rgba(255,255,255,0.92)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    // The body is a hole: a dark disc with a bright rim, no interior at all.
    ctx.fillStyle = 'rgba(2,3,8,0.98)';
    ctx.beginPath();
    ctx.arc(0, 0, 116, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 5;
    ctx.strokeStyle = `hsla(210, 100%, ${64 + this.hitFlash * 30}%, 0.92)`;
    ctx.beginPath();
    ctx.arc(0, 0, 116, 0, TAU);
    ctx.stroke();
    // Rings counting down to nothing.
    for (let i = 0; i < 3; i++) {
      const rr = 116 + 22 + i * 26 + Math.sin(this.t * 1.2 - i) * 6;
      ctx.strokeStyle = `hsla(210, 100%, 70%, ${(0.28 - i * 0.08) * (0.4 + this.field)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 96px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = `rgba(228,240,255,${0.5 + this.hitFlash * 0.4})`;
    ctx.shadowColor = 'hsla(210,100%,60%,0.9)';
    ctx.shadowBlur = 30;
    ctx.fillText('0', this.x, this.y + 4);
    ctx.restore();
  }
}
