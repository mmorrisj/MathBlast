// Grade-7 fraction arithmetic: 1/2 + 1/3.
//
// Each operand is a disc cut into its own denominator with its numerator lit,
// so unlike denominators are visibly unlike -- which is the whole difficulty of
// the topic. Any equivalent form of the answer is accepted.

import { TAU, clamp, gcd, easeOutCubic, roundRect } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

const R = 34;

function drawDisc(ctx, x, y, p, q, hue, t) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = `hsla(${hue}, 60%, 11%, 0.95)`;
  ctx.fill();

  // Lit numerator wedges.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < p; i++) {
    const a0 = -Math.PI / 2 + (i / q) * TAU;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, R - 2, a0 + 0.015, a0 + TAU / q - 0.015);
    ctx.closePath();
    ctx.fillStyle = `hsla(${hue}, 95%, ${48 + Math.sin(t * 2 + i) * 6}%, 0.85)`;
    ctx.fill();
  }
  // Every cut, so the denominator is countable.
  ctx.strokeStyle = `hsla(${hue + 20}, 100%, 78%, 0.45)`;
  ctx.lineWidth = 1.1;
  for (let i = 0; i < q; i++) {
    const a = -Math.PI / 2 + (i / q) * TAU;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
    ctx.stroke();
  }
  ctx.strokeStyle = `hsla(${hue}, 100%, 72%, 0.85)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export class FracOpBeast extends Beast {
  constructor(p1, q1, p2, q2, op, x, y, speed) {
    super(x, y, speed);
    this.p1 = p1; this.q1 = q1; this.p2 = p2; this.q2 = q2; this.op = op;
    const num = op === '+' ? p1 * q2 + p2 * q1 : p1 * q2 - p2 * q1;
    const den = q1 * q2;
    const g = gcd(Math.abs(num), den) || 1;
    this.rp = num / g;
    this.rq = den / g;
    this.hue = theme.void + 12;
    this.dieFor = 0.5;
    this.w = R * 4 + 52;
    this.h = R * 2 + 26;
  }

  get magnitude() { return this.q1 * this.q2 * 0.8; }
  get promptText() { return `${this.p1}/${this.q1} ${this.op} ${this.p2}/${this.q2}`; }
  get hintText() { return `${this.promptText} =   (as p/q)`; }
  get answerText() { return this.rq === 1 ? String(this.rp) : `${this.rp}/${this.rq}`; }

  accepts(raw) {
    const s = String(raw).trim();
    const m = /^(-?\d+)\s*\/\s*(\d+)$/.exec(s);
    if (m) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      return b !== 0 && a * this.rq === b * this.rp;
    }
    if (/^-?\d+$/.test(s)) return this.rq === 1 && parseInt(s, 10) === this.rp;
    return false;
  }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    particles.burst(this.x, this.y, 40, {
      hue: this.hue, speed: 340, life: 0.9, size: 4.2, stretch: 1,
      glyphs: [String(this.rp), '/', String(this.rq)],
    });
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    ctx.save();
    if (dying) ctx.globalAlpha = 1 - easeOutCubic(dieP);
    this.drawShell(ctx, isTarget && !dying, this.w * 0.56);

    ctx.save();
    roundRect(ctx, this.x - this.w / 2, this.y - this.h / 2, this.w, this.h, 12);
    ctx.fillStyle = `hsla(${this.hue}, 50%, 8%, 0.85)`;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `hsla(${this.hue}, 80%, 60%, ${this.hitFlash > 0 ? 1 : 0.45})`;
    ctx.stroke();
    ctx.restore();

    const gap = R + 26;
    drawDisc(ctx, this.x - gap, this.y, this.p1, this.q1, this.hue, this.t);
    drawDisc(ctx, this.x + gap, this.y, this.p2, this.q2, this.hue + 26, this.t + 1);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 28px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = '#ffeccf';
    ctx.fillText(this.op, this.x, this.y + 1);
    ctx.restore();

    if (!dying) this.drawLabel(ctx, this.promptText, 24);
    ctx.restore();
  }
}

export function makeFracOp(wave) {
  const dens = [2, 3, 4, 5, 6, 8];
  const cap = clamp(3 + Math.floor(wave / 2), 3, dens.length);
  const pick = () => dens[Math.floor(Math.random() * cap)];
  const op = Math.random() < 0.6 ? '+' : '−';

  // Retry rather than nudge: subtraction must stay positive, and "2/4 − 3/6"
  // is a valid sum and a terrible puzzle.
  for (let attempt = 0; attempt < 24; attempt++) {
    const q1 = pick(), q2 = pick();
    const p1 = 1 + Math.floor(Math.random() * (q1 - 1));
    const p2 = 1 + Math.floor(Math.random() * (q2 - 1));
    if (op === '+') return { p1, q1, p2, q2, op };
    const lhs = p1 * q2, rhs = p2 * q1;
    if (lhs === rhs) continue;
    return lhs > rhs ? { p1, q1, p2, q2, op } : { p1: p2, q1: q2, p2: p1, q2: q1, op };
  }
  return { p1: 3, q1: 4, p2: 1, q2: 4, op };
}
