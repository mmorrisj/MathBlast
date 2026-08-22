// A boss shell built from one linear equation, cracked one step at a time.
//
//   stage 0   3x + 7 = 22     isolate:  22 - 7 = ?     -> 15
//   stage 1   3x = 15         solve:    15 / 3 = ?     -> 5
//   stage 2   x = 5           verify:   3 x 5 + 7 = ?  -> 22
//
// Each correct step shatters one of three concentric rings, so the algebra and
// the armour come apart together.

import { TAU, rand, clamp, roundRect, easeOutCubic } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

export class BossBeast extends Beast {
  constructor(a, b, xVal, x, y, speed) {
    super(x, y, speed);
    this.a = a; this.b = b;
    this.xVal = xVal;
    this.c = a * xVal + b;
    this.stage = 0;
    this.stages = 3;
    this.r = 78;
    this.w = this.r * 2;
    this.h = this.r * 2;
    this.hue = theme.boss;
    this.dieFor = 1.05;
    this.crack = [0, 0, 0];       // per-ring shatter animation
  }

  get magnitude() { return this.c * 2.4; }
  get isBoss() { return true; }

  get promptText() {
    if (this.stage === 0) return `${this.a}x + ${this.b} = ${this.c}`;
    if (this.stage === 1) return `${this.a}x = ${this.c - this.b}`;
    return `x = ${this.xVal}`;
  }

  get hintText() {
    if (this.stage === 0) return `isolate: ${this.c} − ${this.b} =`;
    if (this.stage === 1) return `solve: ${this.c - this.b} ÷ ${this.a} =`;
    return `verify: ${this.a} × ${this.xVal} + ${this.b} =`;
  }

  get answerText() {
    if (this.stage === 0) return String(this.c - this.b);
    if (this.stage === 1) return String(this.xVal);
    return String(this.c);
  }

  accepts(raw) { return parseInt(raw, 10) === parseInt(this.answerText, 10); }

  // Only the last stage kills it; earlier stages crack a ring and continue.
  resolve() {
    this.crack[this.stage] = 1;
    this.stage++;
    if (this.stage >= this.stages) { this.kill(); return true; }
    this.hitFlash = 0.6;
    return false;
  }

  update(dt) {
    super.update(dt);
    for (let i = 0; i < this.crack.length; i++) {
      if (this.crack[i] > 0 && this.crack[i] < 1.999) this.crack[i] += dt * 1.6;
    }
  }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    particles.burst(this.x, this.y, 120, {
      hue: 320, speed: 620, life: 1.5, size: 6, grav: 180, stretch: 1.2,
      glyphs: [...String(this.c).split(''), 'x', '='],
    });
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    ctx.save();
    if (dying) {
      const s = 1 + easeOutCubic(dieP) * 0.5;
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
      ctx.globalAlpha = 1 - easeOutCubic(dieP);
    }

    this.drawShell(ctx, isTarget && !dying, this.r * 1.25);

    // Core.
    ctx.save();
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 0.62);
    g.addColorStop(0, `hsla(${this.hue}, 90%, ${34 + this.hitFlash * 40}%, 0.98)`);
    g.addColorStop(1, `hsla(${this.hue}, 90%, 10%, 0.98)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.62, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Three armour rings; each shatters as its stage is solved.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.stages; i++) {
      const broken = this.crack[i] > 0;
      const shatter = clamp(this.crack[i], 0, 1);
      const rr = this.r * (0.72 + i * 0.14);
      const segs = 10 + i * 2;
      const alpha = broken ? Math.max(0, 1 - shatter) * 0.7 : 0.62;
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `hsla(${this.hue + i * 14}, 100%, ${64 + this.hitFlash * 25}%, ${alpha})`;
      ctx.lineWidth = 5 - i * 0.8;
      // Segments sharing a push distance are stroked as one path: intact rings
      // cost a single stroke instead of a dozen.
      const groups = broken ? 3 : 1;
      for (let gi = 0; gi < groups; gi++) {
        const push = broken ? shatter * 46 * (1 + gi * 0.4) : 0;
        const rad = rr + push;
        ctx.beginPath();
        for (let s = gi; s < segs; s += groups) {
          const a0 = (s / segs) * TAU + this.t * (0.22 + i * 0.1) * (i % 2 ? -1 : 1);
          // Move to the arc's own start point, or arc() draws a joining line
          // from wherever the path currently is.
          ctx.moveTo(this.x + Math.cos(a0) * rad, this.y + Math.sin(a0) * rad);
          ctx.arc(this.x, this.y, rad, a0, a0 + (TAU / segs) * 0.72);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // Stage pips.
    ctx.save();
    for (let i = 0; i < this.stages; i++) {
      const done = i < this.stage;
      ctx.globalCompositeOperation = done ? 'lighter' : 'source-over';
      ctx.fillStyle = done ? 'hsla(48,100%,66%,0.95)' : 'rgba(120,110,150,0.35)';
      roundRect(ctx, this.x - 26 + i * 18, this.y + this.r * 0.72, 12, 5, 2.5);
      ctx.fill();
    }
    ctx.restore();

    if (!dying) this.drawLabel(ctx, this.promptText, 30);
    ctx.restore();
  }
}
