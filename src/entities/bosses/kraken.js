// The Kraken -- wave ten, and the first Leviathan.
//
// The boss the game had before this was a shell holding one equation, 156px
// across -- shorter than an ordinary nine-by-twelve multiplication lattice,
// with no announcement, no camera change and no music change. It was reported
// as "I have not seen the bosses", which is the correct reading of something
// that looks smaller than the thing beside it.
//
// So: a core hangs above the dome and arms spiral around it holding problems.
// Every few seconds an arm lets go and drives at the planet at three times a
// normal descent, so the pressure is time, not size. Hitstop and slow motion
// are suppressed for the duration -- the fight should not keep stopping to
// admire itself.
//
// The arms are ordinary beasts from the current curriculum, which is what
// makes the whole encounter cheap: the Kraken knows nothing about difficulty
// tiers, the adaptive plan, or scoring.

import { TAU, clamp, randInt } from '../../util.js';
import { Encounter } from './base.js';

const CORE_R = 140;
const ORBIT = 330;
const SQUASH = 0.5;           // flatten the orbit, or arms ride up under the HUD
const WIND_UP = 1.1;          // seconds of telegraph before an arm lets go
const LAUNCH_SPEED = 150;     // px/s -- about 2.6s from the core to the dome
const REGROW = 2.6;           // pause before a cut arm is replaced

export class Kraken extends Encounter {
  constructor(x, y, wave, arms) {
    super(x, y, wave);
    this.armTotal = arms;
    this.spawned = 0;
    this.launched = 0;
    this.charging = null;         // the arm about to let go
    this.chargeT = 0;
    // Faster with the wave, floored so wave ten is already tense.
    this.fireEvery = clamp(4.6 - wave * 0.06, 2.6, 4.6);
    this.fireTimer = 2.2;         // a beat to read the board before the first
  }

  static get title() { return 'THE KRAKEN'; }
  static get tagline() { return 'CLEAR THE ORBIT'; }
  static get coreHits() { return 3; }
  static get zoom() { return 0.74; }
  static get originY() { return 300; }
  static get remnant() { return { glyph: '∞', hue: 188 }; }

  // The arms *are* the armour. Kill them one at a time and a replacement grows
  // into the gap; empty the orbit and the core is bare. That turns a grind
  // down a counter into a real tactical goal -- burn the orbit down faster
  // than it refills -- and it is the same shape as the encounter's own art.
  get armour() { return clamp(this.arms.length / 3, 0, 1); }
  get spent() { return this.coreDone >= this.coreTotal; }
  get left() { return this.coreTotal - this.coreDone; }
  get total() { return this.coreTotal; }

  // Kept for the code and tests that read the Kraken's arms by name. The core
  // problem is held too but is not an arm.
  get arms() { return this.held.filter((b) => !b.core); }

  // Cracked: the orbit floods back in and it starts again.
  _cracked() { this.regrow = 0.5; }

  _core() {
    const a = randInt(3, 12), b = randInt(3, 12);
    return {
      prompt: `${a} × ${b}`, answer: a * b, concept: 'mult', a, b, op: '×',
      mag: 70, hue: this.hue, size: 36, w: 180, h: 130,
    };
  }

  _fight(dt, api) {
    this.spin = (this.spin || 0) + dt * 0.42;
    if (this.charging && !this.held.includes(this.charging)) this.charging = null;

    // Drift so it is never quite still.
    this.x += Math.sin(this.t * 0.5 + this.drift) * 14 * dt;

    // Keep the orbit full -- but not instantly. The regrow delay is what makes
    // emptying it possible at all: without it a killed arm is replaced the same
    // frame and the orbit is never bare.
    this.regrow = Math.max(0, (this.regrow || 0) - dt);
    let arms = this.arms;
    // The orbit starts full. Filling it one arm at a time from empty meant the
    // armour was zero on the first frame -- the core lay open before the boss
    // had a single arm to guard it, and the fight began already cracked. The
    // delay belongs to replacing a cut arm, not to arriving.
    if (!this.seeded) {
      while (arms.length < 3) {
        const a = api.curriculum(this.x, 210);
        if (!a) break;
        this.held.push(a);
        this.spawned++;
        arms = this.arms;
      }
      this.seeded = true;
      this.regrow = REGROW;
    } else if (arms.length < 3 && this.regrow <= 0 && !this.openCore) {
      const a = api.curriculum(this.x, 210);
      if (a) {
        this.held.push(a);
        this.spawned++;
        this.regrow = REGROW;
        arms = this.arms;
      }
    }

    // Hold the attached arms in orbit.
    arms.forEach((a, i) => {
      const ang = this.spin + (i / Math.max(1, arms.length)) * TAU;
      const r = ORBIT + Math.sin(this.t * 1.3 + i) * 18;
      a.x = this.x + Math.cos(ang) * r;
      a.y = this.y + Math.sin(ang) * r * SQUASH;
      a.orbitAngle = ang;
    });
    // The core hangs at the centre, where the arms were guarding.
    if (this.coreBeast) { this.coreBeast.x = this.x; this.coreBeast.y = this.y; }

    this.fireTimer -= dt;
    // A wind-up before it lets go. Without one the first warning is the arm
    // already halfway to the planet, and 2.6 seconds of flight is not a
    // question, it is a coin toss.
    if (!this.charging && this.fireTimer <= WIND_UP && arms.length) {
      this.charging = arms.reduce((lo, a) => (a.y > lo.y ? a : lo), arms[0]);
      this.chargeT = 0;
    }
    if (this.charging) {
      this.chargeT += dt;
      this.charging.charging = clamp(this.chargeT / WIND_UP, 0, 1);
    }
    if (this.fireTimer <= 0 && this.charging) {
      this.fireTimer = this.fireEvery;
      const pick = this.charging;
      pick.charging = 0;
      this.charging = null;
      this.launched++;
      // Fast enough to be the pressure, slow enough to be answerable: roughly
      // 2.6s from the core to the dome, against 11-19s for a normal descent.
      api.release(pick, LAUNCH_SPEED);
    }
  }

  _drawOpen(ctx) { super._drawOpen(ctx, CORE_R); }

  _drawBody(ctx) {
    // Tentacles: a spiral out to each attached arm, thick at the root.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const a of this.arms) {
      const ang = a.orbitAngle != null ? a.orbitAngle : 0;
      const len = Math.hypot(a.x - this.x, a.y - this.y);
      const steps = 16;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const f = i / steps;
          // The spiral: the angle unwinds as the radius grows, so the arm
          // reads as coiled rather than as a straight spoke.
          const th = ang + (1 - f) * 1.5 * (pass ? -1 : 1);
          const rr = CORE_R * 0.5 + (len - CORE_R * 0.5) * f;
          const wob = Math.sin(f * 7 + this.t * 3 + ang) * 10 * f;
          const px = this.x + Math.cos(th) * rr + Math.cos(th + 1.57) * wob;
          const py = this.y + Math.sin(th) * rr * SQUASH + Math.sin(th + 1.57) * wob * 0.5;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        const hot = a === this.charging ? this.chargeT / WIND_UP : 0;
        ctx.strokeStyle = hot
          ? `hsla(${12 + hot * 20}, 100%, ${60 + hot * 25}%, ${0.7 + hot * 0.3})`
          : `hsla(${this.hue + pass * 18}, 95%, ${52 + this.hitFlash * 30}%, ${pass ? 0.45 : 0.8})`;
        ctx.lineWidth = (pass ? 6 : 14) * (1 + hot * 0.7);
        ctx.stroke();
      }
    }
    ctx.restore();

    // The core.
    ctx.save();
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, CORE_R);
    g.addColorStop(0, `hsla(${this.hue}, 95%, ${46 + this.hitFlash * 34}%, 0.98)`);
    g.addColorStop(0.7, `hsla(${this.hue}, 90%, 16%, 0.96)`);
    g.addColorStop(1, `hsla(${this.hue}, 90%, 8%, 0)`);
    const open = this.open;
    ctx.fillStyle = `rgba(8,4,14,${0.94 - open * 0.7})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, CORE_R * 0.66, 0, TAU);
    ctx.fill();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, CORE_R, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = `hsla(${this.hue}, 100%, ${58 + this.hitFlash * 30}%, 0.9)`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, CORE_R * 0.66, 0, TAU);
    ctx.stroke();

    // A slow iris so it looks awake.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const rr = CORE_R * (0.3 + i * 0.16) + Math.sin(this.t * (1.1 + i * 0.4)) * 5;
      ctx.strokeStyle = `hsla(${this.hue + i * 20}, 100%, 66%, ${0.5 - i * 0.12})`;
      ctx.lineWidth = 3 - i * 0.6;
      ctx.arc(this.x, this.y, rr, this.t * (0.6 + i * 0.3), this.t * (0.6 + i * 0.3) + TAU * 0.72);
      ctx.stroke();
    }
    ctx.restore();
  }
}
