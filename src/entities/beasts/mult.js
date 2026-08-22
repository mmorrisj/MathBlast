// The founding beast: `a x b` rendered as a countable a-by-b lattice, so
// multiplication looks like area. Solving it runs a diagonal collapse wave
// through the grid, making the kill animation a picture of the array being
// consumed.

import { TAU, rand, clamp, roundRect, addRoundRect, easeOutCubic } from '../../util.js';
import { Beast } from './base.js';

const CELL = 12;
const GAP = 3;
const PITCH = CELL + GAP;
const COLLAPSE_T = 0.45;

export class MultBeast extends Beast {
  constructor(a, b, x, y, speed) {
    super(x, y, speed);
    this.a = a; this.b = b;
    this.w = a * PITCH;
    this.h = b * PITCH;
    this.dieFor = COLLAPSE_T + 0.18;
    this.cellPhase = new Float32Array(a * b);
    for (let i = 0; i < a * b; i++) this.cellPhase[i] = rand(TAU);
  }

  get magnitude() { return this.a * this.b; }
  get promptText() { return `${this.a} × ${this.b}`; }
  get answerText() { return String(this.a * this.b); }
  accepts(raw) { return parseInt(raw, 10) === this.a * this.b; }

  _cellDeath(i, j) {
    const diag = (i + j) / Math.max(1, this.a + this.b - 2);
    return diag * 0.72 * COLLAPSE_T;
  }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying') return;
    const x0 = this.x - this.w / 2;
    const y0 = this.y - this.h / 2;
    const digits = this.answerText.split('');
    for (let j = 0; j < this.b; j++) {
      for (let i = 0; i < this.a; i++) {
        const d = this._cellDeath(i, j);
        if (d > prevT && d <= this.dieT) {
          particles.spawn({
            x: x0 + i * PITCH + CELL / 2,
            y: y0 + j * PITCH + CELL / 2,
            vx: rand(90, -90), vy: rand(40, -170),
            life: rand(0.85, 0.4), size: rand(3.4, 1.6),
            hue: 46 + rand(26), grav: 190, stretch: 0.8,
            glyph: Math.random() < 0.22 ? digits[(Math.random() * digits.length) | 0] : null,
            rot: rand(TAU), spin: rand(7, -7),
          });
        }
      }
    }
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    const x0 = this.x - this.w / 2;
    const y0 = this.y - this.h / 2;
    const flash = this.hitFlash;

    ctx.save();
    if (dying) {
      const s = 1 + easeOutCubic(dieP) * 0.16;
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
      ctx.globalAlpha = 1 - easeOutCubic(dieP) * 0.85;
    }

    this.drawShell(ctx, isTarget && !dying, Math.max(this.w, this.h) * 0.62);

    ctx.save();
    roundRect(ctx, x0 - 7, y0 - 7, this.w + 14, this.h + 14, 10);
    ctx.fillStyle = `hsla(${this.hue}, 45%, 9%, 0.85)`;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `hsla(${this.hue}, 80%, 55%, 0.5)`;
    ctx.stroke();
    ctx.restore();

    // Cells are bucketed by shimmer brightness and filled as four paths rather
    // than one fill per cell -- a 12x12 beast is 144 cells, and six of them on
    // screen at once was the single largest draw cost in the frame.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const buckets = [[], [], [], []];
    for (let j = 0; j < this.b; j++) {
      for (let i = 0; i < this.a; i++) {
        if (dying && this.dieT >= this._cellDeath(i, j)) continue;
        const shimmer = 0.72 + Math.sin(this.t * 3.4 + this.cellPhase[j * this.a + i]) * 0.28;
        const bi = clamp(Math.floor((shimmer - 0.44) / 0.14), 0, 3);
        buckets[bi].push(x0 + i * PITCH, y0 + j * PITCH);
      }
    }
    for (let bi = 0; bi < 4; bi++) {
      const cells = buckets[bi];
      if (!cells.length) continue;
      const shimmer = 0.51 + bi * 0.14;
      ctx.fillStyle = flash > 0
        ? `hsla(0, 100%, 88%, ${0.85 * shimmer + 0.15})`
        : `hsla(${this.hue + shimmer * 14}, 100%, ${52 + shimmer * 22}%, ${0.85 * shimmer + 0.15})`;
      ctx.beginPath();
      for (let k = 0; k < cells.length; k += 2) {
        addRoundRect(ctx, cells[k], cells[k + 1], CELL, CELL, 2.5);
      }
      ctx.fill();
    }
    ctx.restore();

    if (!dying) this.drawLabel(ctx, this.promptText);
    ctx.restore();
  }
}
