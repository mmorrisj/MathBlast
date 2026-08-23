// Grade-7 squares and square roots.
//
// Both are the same picture from opposite ends: n squared shows an n-by-n
// outline and asks for the area; a root shows the filled area and asks for the
// side. It is the multiplication lattice's idea, turned into a question about
// dimension.

import { rand, clamp, easeOutCubic, roundRect, addRoundRect, toInt } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

export class PowerBeast extends Beast {
  // mode is 'square' (n^2 = ?) or 'root' (sqrt(n^2) = ?)
  constructor(n, mode, x, y, speed) {
    super(x, y, speed);
    this.n = n;
    this.mode = mode;
    this.value = mode === 'square' ? n * n : n;
    this.cell = clamp(Math.round(120 / n), 7, 18);
    this.gap = this.cell > 10 ? 3 : 2;
    this.side = n * (this.cell + this.gap) - this.gap;
    this.hue = theme.hostile + 34;
    this.dieFor = 0.5;
    this.w = this.side + 24;
    this.h = this.side + 24;
  }

  get magnitude() { return this.n * this.n * 0.5; }
  get promptText() { return this.mode === 'square' ? `${this.n}²` : `√${this.n * this.n}`; }
  get concept() { return 'power'; }
  get hintText() {
    return this.mode === 'square' ? `${this.n}² =   (the area)` : `√${this.n * this.n} =   (the side)`;
  }
  get answerText() { return String(this.value); }
  accepts(raw) { return toInt(raw) === this.value; }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    particles.burst(this.x, this.y, 40, {
      hue: 44, speed: 340, life: 0.85, size: 4, grav: 150, stretch: 1,
      glyphs: this.answerText.split(''),
    });
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    const x0 = this.x - this.side / 2;
    const y0 = this.y - this.side / 2;

    ctx.save();
    if (dying) {
      const s = 1 + easeOutCubic(dieP) * 0.18;
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
      ctx.globalAlpha = 1 - easeOutCubic(dieP) * 0.9;
    }
    this.drawShell(ctx, isTarget && !dying, this.side * 0.85);

    ctx.save();
    roundRect(ctx, x0 - 10, y0 - 10, this.side + 20, this.side + 20, 10);
    ctx.fillStyle = `hsla(${this.hue}, 45%, 9%, 0.86)`;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `hsla(${this.hue}, 80%, 58%, ${this.hitFlash > 0 ? 1 : 0.5})`;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (this.mode === 'root') {
      // Filled: the area is given, the side is the question.
      ctx.beginPath();
      for (let j = 0; j < this.n; j++) {
        for (let i = 0; i < this.n; i++) {
          addRoundRect(ctx, x0 + i * (this.cell + this.gap), y0 + j * (this.cell + this.gap),
                       this.cell, this.cell, 2);
        }
      }
      ctx.fillStyle = `hsla(${this.hue}, 95%, ${46 + Math.sin(this.t * 3) * 8}%, 0.9)`;
      ctx.fill();
    } else {
      // Outline plus edge ticks: the side is given, the area is the question.
      ctx.strokeStyle = `hsla(${this.hue}, 95%, 62%, 0.75)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= this.n; i++) {
        const p = i * (this.cell + this.gap) - this.gap / 2;
        ctx.moveTo(x0 + p, y0 - 2); ctx.lineTo(x0 + p, y0 + this.side + 2);
        ctx.moveTo(x0 - 2, y0 + p); ctx.lineTo(x0 + this.side + 2, y0 + p);
      }
      ctx.stroke();
    }
    // Side length markers on two edges.
    ctx.strokeStyle = `hsla(48, 100%, 70%, 0.8)`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 6); ctx.lineTo(x0 + this.side, y0 - 6);
    ctx.moveTo(x0 - 6, y0); ctx.lineTo(x0 - 6, y0 + this.side);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${this.mode === 'root' ? 30 : 26}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.shadowColor = `hsla(${this.hue},100%,60%,0.9)`;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffeccf';
    ctx.fillText(this.mode === 'root' ? '?' : `${this.n}`, this.x, this.y);
    ctx.restore();

    if (!dying) this.drawLabel(ctx, this.promptText, 26);
    ctx.restore();
  }
}

export function makePower(wave) {
  const cap = clamp(5 + Math.floor(wave / 2), 5, 13);
  const n = 2 + Math.floor(Math.random() * (cap - 1));
  return { n, mode: Math.random() < 0.55 ? 'square' : 'root' };
}
