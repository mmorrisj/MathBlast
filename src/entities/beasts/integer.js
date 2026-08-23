// Grade-7 signed arithmetic: -8 x 7, -45 / 9.
//
// Negatives reuse the voidling's visual grammar -- a dark disc with a bright
// rim -- and positives are solid and warm. Sign rules are learned by seeing
// which pairings produce which result, not by being told.

import { TAU, rand, clamp, roundRect, easeOutCubic, toInt } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

const R = 30;

function drawChip(ctx, x, y, value, t) {
  const neg = value < 0;
  ctx.save();
  if (neg) {
    ctx.fillStyle = 'rgba(4,3,12,0.96)';
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `hsla(${theme.void}, 100%, ${74 + Math.sin(t * 3) * 10}%, 0.95)`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(x - R * 0.3, y - R * 0.3, 2, x, y, R);
    g.addColorStop(0, `hsla(${theme.hostile + 16}, 85%, 46%, 0.98)`);
    g.addColorStop(1, `hsla(${theme.hostile}, 85%, 16%, 0.98)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `hsla(${theme.hostile}, 95%, 62%, 0.75)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 24px "JetBrains Mono", ui-monospace, monospace';
  ctx.shadowColor = neg ? `hsla(${theme.void},100%,70%,0.9)` : `hsla(${theme.hostile},100%,60%,0.9)`;
  ctx.shadowBlur = 14;
  ctx.fillStyle = neg ? '#eadcff' : '#ffe6cf';
  ctx.fillText(neg ? `−${Math.abs(value)}` : String(value), x, y + 1);
  ctx.restore();
}

export class IntegerBeast extends Beast {
  // op is 'x' or '/'.
  constructor(a, b, op, x, y, speed) {
    super(x, y, speed);
    this.a = a; this.b = b; this.op = op;
    this.value = op === 'x' ? a * b : a / b;
    this.hue = theme.void - 20;
    this.dieFor = 0.5;
    this.w = R * 4 + 46;
    this.h = R * 2 + 26;
  }

  get magnitude() { return Math.max(8, Math.abs(this.value) * 1.4); }
  get factOp() { return this.op === 'x' ? '×' : '÷'; }

  get promptText() {
    const fa = this.a < 0 ? `(−${Math.abs(this.a)})` : String(this.a);
    const fb = this.b < 0 ? `(−${Math.abs(this.b)})` : String(this.b);
    return `${fa} ${this.op === 'x' ? '×' : '÷'} ${fb}`;
  }
  get hintText() { return `${this.promptText} =   (− for minus)`; }
  get answerText() { return String(this.value); }

  accepts(raw) {
    const s = String(raw).trim().replace(/^−/, '-');
    if (!/^-?\d+$/.test(s)) return false;
    return parseInt(s, 10) === this.value;
  }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    particles.burst(this.x, this.y, 36, {
      hue: this.value < 0 ? theme.void : 44, speed: 340, life: 0.8, size: 4,
      grav: 140, stretch: 1, glyphs: this.answerText.replace('-', '−').split(''),
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
    ctx.strokeStyle = `hsla(${this.hue}, 80%, 58%, ${this.hitFlash > 0 ? 1 : 0.45})`;
    ctx.stroke();
    ctx.restore();

    const gap = R + 23;
    drawChip(ctx, this.x - gap, this.y, this.a, this.t + this.phase);
    drawChip(ctx, this.x + gap, this.y, this.b, this.t + this.phase + 1);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 26px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = '#ffeccf';
    ctx.fillText(this.op === 'x' ? '×' : '÷', this.x, this.y + 1);
    ctx.restore();

    if (!dying) this.drawLabel(ctx, this.promptText, 24);
    ctx.restore();
  }
}

export function makeInteger(wave) {
  const cap = clamp(6 + Math.floor(wave / 2), 6, 12);
  const mag = () => 2 + Math.floor(Math.random() * (cap - 1));
  // At least one operand negative, so the sign rule is always in play.
  const signA = Math.random() < 0.7 ? -1 : 1;
  const signB = signA < 0 ? (Math.random() < 0.5 ? -1 : 1) : -1;
  if (Math.random() < 0.55) {
    return { a: signA * mag(), b: signB * mag(), op: 'x' };
  }
  const q = signA * mag();
  const d = signB * mag();
  return { a: q * d, b: d, op: '/' };     // always divides exactly
}
