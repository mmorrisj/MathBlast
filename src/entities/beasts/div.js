// Division drawn as equal groups: `a ÷ b` is `b` rings of `a / b` dots. The
// answer is what is in one ring, so a stuck player counts a single group rather
// than reasoning about the whole. That is how sharing is taught, and it is the
// same move as the multiplication lattice -- the picture *is* the operation,
// not a decoration beside it.

import { TAU, rand, clamp, roundRect, easeOutCubic, toInt } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

const DOT = 7;
const RING_PAD = 9;

// A ring of `n` dots, laid out in rows of at most three so a group stays
// square-ish and countable at a glance.
function groupBox(n) {
  const cols = Math.min(3, n);
  const rows = Math.ceil(n / cols);
  return {
    cols, rows,
    w: cols * (DOT + 4) - 4 + RING_PAD * 2,
    h: rows * (DOT + 4) - 4 + RING_PAD * 2,
  };
}

export class DivBeast extends Beast {
  // `a / b` divides exactly; the caller builds it from divisor x quotient.
  constructor(a, b, x, y, speed) {
    super(x, y, speed);
    this.a = a; this.b = b;
    this.value = Math.round(a / b);
    this.hue = theme.hostile - 14;
    this.dieFor = 0.5;

    this.box = groupBox(this.value);
    // Groups sit in a row up to four wide, then wrap.
    this.gCols = Math.min(4, b);
    this.gRows = Math.ceil(b / this.gCols);
    this.w = this.gCols * (this.box.w + 8) - 8 + 20;
    this.h = this.gRows * (this.box.h + 8) - 8 + 26;
    this.dotPhase = new Float32Array(a);
    for (let i = 0; i < a; i++) this.dotPhase[i] = rand(TAU);
  }

  get magnitude() { return Math.max(8, this.a * 1.2); }
  get promptText() { return `${this.a} ÷ ${this.b}`; }
  get factOp() { return '÷'; }
  get hintText() { return `${this.promptText} =`; }
  get answerText() { return String(this.value); }
  accepts(raw) { return toInt(raw) === this.value; }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    particles.burst(this.x, this.y, 30, {
      hue: theme.orb, speed: 300, life: 0.8, size: 3.4, grav: 150, stretch: 0.9,
      glyphs: this.answerText.split(''),
    });
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    const x0 = this.x - this.w / 2;
    const y0 = this.y - this.h / 2;

    ctx.save();
    if (dying) {
      const s = 1 + easeOutCubic(dieP) * 0.18;
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
      ctx.globalAlpha = 1 - easeOutCubic(dieP) * 0.9;
    }

    this.drawShell(ctx, isTarget && !dying, Math.max(this.w, this.h) * 0.62);

    ctx.save();
    roundRect(ctx, x0, y0, this.w, this.h, 10);
    ctx.fillStyle = `hsla(${this.hue}, 45%, 9%, 0.86)`;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `hsla(${this.hue}, 80%, 55%, ${this.hitFlash > 0 ? 1 : 0.5})`;
    ctx.stroke();
    ctx.restore();

    let dot = 0;
    for (let g = 0; g < this.b; g++) {
      const gx = x0 + 10 + (g % this.gCols) * (this.box.w + 8);
      const gy = y0 + 13 + Math.floor(g / this.gCols) * (this.box.h + 8);

      // The ring is what makes it a group rather than a pile.
      ctx.save();
      roundRect(ctx, gx, gy, this.box.w, this.box.h, this.box.w / 2.6);
      ctx.strokeStyle = `hsla(${this.hue + 16}, 85%, 62%, 0.5)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.value; i++) {
        const cx = gx + RING_PAD + (i % this.box.cols) * (DOT + 4) + DOT / 2;
        const cy = gy + RING_PAD + Math.floor(i / this.box.cols) * (DOT + 4) + DOT / 2;
        const tw = 0.82 + Math.sin(this.dotPhase[dot++ % this.a] + this.t * 3) * 0.18;
        ctx.beginPath();
        ctx.arc(cx, cy, (DOT / 2) * tw, 0, TAU);
        ctx.fillStyle = `hsla(${theme.orb}, 95%, 66%, 0.95)`;
        ctx.fill();
      }
      ctx.restore();
    }

    if (!dying) this.drawLabel(ctx, this.promptText, 26);
    ctx.restore();
  }
}

// Built from divisor and quotient so the division is always exact.
export function makeDiv(wave, range) {
  const growth = 1 + Math.floor(wave * 0.5);
  const bMax = clamp(2 + growth, 2, range.divisor);
  const qMax = clamp(2 + growth, 2, range.quotient);
  const b = 2 + Math.floor(Math.random() * (bMax - 1));
  const q = 2 + Math.floor(Math.random() * (qMax - 1));
  return { a: b * q, b };
}
