// A cracked crystal shell. The sphere is whole except for a missing wedge, and
// the wedge is the answer: name the fraction that is gone.
//
// Equivalence falls out of the geometry -- 2/4 and 1/2 cut the same hole, so
// both are accepted, and the player discovers that rather than being told.

import { TAU, rand, clamp, gcd, easeOutCubic } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

export class FractionBeast extends Beast {
  constructor(p, q, x, y, speed) {
    super(x, y, speed);
    const g = gcd(p, q);
    this.p = p; this.q = q;
    this.rp = p / g; this.rq = q / g;      // lowest terms
    this.r = 40 + q * 1.6;
    this.w = this.r * 2;
    this.h = this.r * 2;
    this.hue = theme.void + 20;
    this.dieFor = 0.5;
    this.spin = rand(0.35, 0.12);
  }

  get magnitude() { return this.q * 6; }
  get promptText() { return `? / ${this.q}`; }
  get concept() { return 'fraction'; }
  get hintText() { return `missing piece: ? / ${this.q}  (or 3/8 form) =`; }
  get answerText() { return `${this.rp}/${this.rq}`; }

  accepts(raw) {
    const s = String(raw).trim();
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (m) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (!b) return false;
      return a * this.rq === b * this.rp;  // cross-multiply: any equivalent form
    }
    // A bare number means that many of the slices drawn, which is what the
    // label "? / 8" asks for and what a counting player types.
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10);
      return n * this.rq === this.q * this.rp;
    }
    return false;
  }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    particles.burst(this.x, this.y, 40, {
      hue: 288, speed: 340, life: 0.9, size: 4.4, grav: 120, stretch: 1,
      glyphs: [String(this.rp), '/', String(this.rq)],
    });
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    const rot = this.t * this.spin;
    const gap = (this.p / this.q) * TAU;       // the missing wedge

    ctx.save();
    if (dying) ctx.globalAlpha = 1 - easeOutCubic(dieP);
    this.drawShell(ctx, isTarget && !dying, this.r * 1.2);

    // The intact remainder of the shell.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.arc(this.x, this.y, this.r, rot + gap, rot + TAU);
    ctx.closePath();
    const g = ctx.createRadialGradient(this.x, this.y, this.r * 0.2, this.x, this.y, this.r);
    g.addColorStop(0, `hsla(${this.hue}, 70%, 34%, 0.95)`);
    g.addColorStop(1, `hsla(${this.hue}, 75%, 12%, 0.95)`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `hsla(${this.hue}, 100%, ${this.hitFlash > 0 ? 90 : 68}%, 0.85)`;
    ctx.stroke();
    ctx.restore();

    // Crystal facets: spokes at every 1/q, so the denominator is countable.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `hsla(${this.hue + 20}, 100%, 74%, 0.3)`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < this.q; i++) {
      const a = rot + (i / this.q) * TAU;
      if (a - rot < gap - 0.001) continue;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r);
      ctx.stroke();
    }
    ctx.restore();

    // The hole is the question, so it has to be unmistakable: punched out to
    // near-black against the lit shell, then edged in gold.
    const pulse = 0.5 + Math.sin(this.t * 3.6 + this.phase) * 0.3;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.arc(this.x, this.y, this.r * 0.99, rot, rot + gap);
    ctx.closePath();
    ctx.fillStyle = 'rgba(4,3,12,0.88)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.arc(this.x, this.y, this.r * 0.99, rot, rot + gap);
    ctx.closePath();
    const hg = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
    hg.addColorStop(0, `hsla(48, 100%, 70%, ${0.16 * pulse})`);
    hg.addColorStop(1, 'hsla(48, 100%, 60%, 0)');
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = `hsla(48, 100%, 78%, ${0.75 + pulse * 0.25})`;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();

    if (!dying) this.drawLabel(ctx, this.promptText, 26);
    ctx.restore();
  }
}
