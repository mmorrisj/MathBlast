// The Kraken: the wave-ten encounter.
//
// The boss the game already had was a shell holding one equation, 156px across
// -- shorter than an ordinary nine-by-twelve multiplication lattice, with no
// announcement, no camera change and no music change. It was reported as "I
// have not seen the bosses", which is the correct reading of something that
// looks smaller than the thing beside it.
//
// This is an encounter rather than a big beast. The camera pulls back to open
// the field, a core hangs above the dome, and arms spiral around it holding
// problems. Every few seconds an arm lets go and drives at the planet at three
// times a normal descent, so the pressure is time, not size. Hitstop and slow
// motion are suppressed for the duration: the fight should not keep stopping
// to admire itself.
//
// The arms are ordinary beasts from the current curriculum, pushed into
// game.beasts, so targeting, answering, scoring, the skill table and the
// progress ledger all work on them without knowing the Kraken exists.

import { TAU, clamp, rand, easeOutCubic } from '../util.js';
import { theme } from '../theme.js';

const CORE_R = 140;
const ORBIT = 330;
const SQUASH = 0.5;           // flatten the orbit, or arms ride up under the HUD
const EXPOSED = 0.9;          // core laid bare, before the shot
const CHARGE = 1.15;          // the turret winding up
const WIND_UP = 1.1;          // seconds of telegraph before an arm lets go
const LAUNCH_SPEED = 150;     // px/s -- about 2.6s from the core to the dome

export class Kraken {
  constructor(x, y, arms, wave) {
    this.x = x; this.y = y;
    this.t = 0;
    this.spin = 0;
    this.total = arms;            // arms this Kraken will ever grow
    this.spawned = 0;
    this.arms = [];               // beasts still attached, in orbit
    this.launched = 0;
    this.charging = null;         // the arm about to let go
    this.chargeT = 0;
    this.hue = theme.boss;
    this.state = 'alive';
    this.dieT = 0;
    // Faster with the wave, floored so wave ten is already tense.
    this.fireEvery = clamp(4.6 - wave * 0.06, 2.6, 4.6);
    this.fireTimer = 2.2;         // a beat to read the board before the first
    this.drift = rand(TAU);
    this.hitFlash = 0;
    // fight -> exposed -> firing -> dying. The last arm does not kill it; the
    // core has to be shot, which is what makes the ending an ending.
    this.phase = 'fight';
    this.phaseT = 0;
  }

  get alive() { return this.state === 'alive'; }
  // Every arm grown and none still attached. Keyed on how many have been
  // *grown*, not how many have fired: otherwise destroying an arm in orbit
  // just made room for a replacement and the fight never advanced, which
  // punished the player for being quick.
  get spent() { return this.spawned >= this.total && this.arms.length === 0; }
  get exposed() { return this.phase === 'exposed' || this.phase === 'firing'; }
  // 0..1 while the turret winds up, for the beam the game draws.
  get charge() { return this.phase === 'firing' ? clamp(this.phaseT / CHARGE, 0, 1) : 0; }
  get left() { return this.total - this.spawned + this.arms.length; }

  // `attach` is handed a fresh beast from the game's own spawner.
  update(dt, attach, onFire) {
    this.t += dt;
    this.spin += dt * (this.phase === 'fight' ? 0.42 : 1.6);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.4);
    if (this.state === 'dying') { this.dieT += dt; return; }

    if (this.phase !== 'fight') {
      this.phaseT += dt;
      // It thrashes while it is open, and drifts up as if trying to leave.
      this.x += Math.sin(this.t * 5) * 40 * dt;
      this.y -= dt * 10;
      if (this.phase === 'exposed' && this.phaseT >= EXPOSED) {
        this.phase = 'firing';
        this.phaseT = 0;
      }
      return;
    }

    // Drift so it is never quite still.
    this.x += Math.sin(this.t * 0.5 + this.drift) * 14 * dt;

    // Keep the orbit full while there are arms left to grow.
    this.arms = this.arms.filter((a) => a.alive && a.attached);
    if (this.charging && !this.arms.includes(this.charging)) this.charging = null;
    const want = Math.min(3, this.total - this.spawned);
    while (this.arms.length < want) {
      const a = attach();
      if (!a) break;
      a.attached = true;
      a.speed = 0;
      this.arms.push(a);
      this.spawned++;
    }

    // Hold the attached arms in orbit.
    this.arms.forEach((a, i) => {
      const ang = this.spin + (i / Math.max(1, this.arms.length)) * TAU;
      const r = ORBIT + Math.sin(this.t * 1.3 + i) * 18;
      a.x = this.x + Math.cos(ang) * r;
      a.y = this.y + Math.sin(ang) * r * SQUASH;
      a.orbitAngle = ang;
    });

    this.fireTimer -= dt;
    // A wind-up before it lets go. Without it the first warning is the arm
    // already halfway to the planet, and 2.6 seconds of flight is not a
    // question, it is a coin toss.
    if (!this.charging && this.fireTimer <= WIND_UP && this.arms.length) {
      this.charging = this.arms.reduce((lo, a) => (a.y > lo.y ? a : lo), this.arms[0]);
      this.chargeT = 0;
    }
    if (this.charging) {
      this.chargeT += dt;
      this.charging.charging = clamp(this.chargeT / WIND_UP, 0, 1);
    }
    if (this.fireTimer <= 0 && this.charging) {
      this.fireTimer = this.fireEvery;
      const pick = this.charging;
      pick.attached = false;
      pick.charging = 0;
      pick.launched = true;
      // Fast enough to be the pressure, slow enough to be answerable: roughly
      // 2.6s from the core to the dome, against 11-19s for a normal descent.
      pick.speed = LAUNCH_SPEED;
      this.launched++;
      this.arms = this.arms.filter((a) => a !== pick);
      this.charging = null;
      if (onFire) onFire(pick);
    }
  }

  // Called when the last arm falls: stop the fight and lay the core open.
  expose() {
    if (this.phase === 'fight') { this.phase = 'exposed'; this.phaseT = 0; }
  }

  get readyToBlow() { return this.phase === 'firing' && this.phaseT >= CHARGE; }

  kill() { this.state = 'dying'; this.dieT = 0; }

  draw(ctx) {
    const dying = this.state === 'dying';
    const p = dying ? clamp(this.dieT / 1.4, 0, 1) : 0;
    ctx.save();
    if (dying) {
      ctx.globalAlpha = 1 - easeOutCubic(p);
      const s = 1 + easeOutCubic(p) * 0.6;
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
    }

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
    // Laid open: the shell splits and the inside glows white-hot.
    const open = this.exposed ? clamp(this.phaseT / (this.phase === 'firing' ? CHARGE : EXPOSED), 0, 1) : 0;
    if (this.exposed) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const wg = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, CORE_R * (0.7 + open * 0.9));
      wg.addColorStop(0, `rgba(255,255,255,${0.5 + open * 0.5})`);
      wg.addColorStop(0.4, `hsla(${44 - open * 30}, 100%, 70%, ${0.5 + open * 0.4})`);
      wg.addColorStop(1, 'hsla(12,100%,60%,0)');
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.arc(this.x, this.y, CORE_R * (0.7 + open * 0.9), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
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

    // How many arms are left, as pips under the core.
    const left = this.left;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.total; i++) {
      const spread = (this.total - 1) * 11;
      ctx.fillStyle = i < left ? `hsla(${this.hue}, 100%, 70%, 0.9)` : 'rgba(120,110,150,0.3)';
      ctx.beginPath();
      ctx.arc(this.x - spread + i * 22, this.y + CORE_R * 0.78, 5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }
}
