// Grade-7 percentages: 15% of 80.
//
// Drawn as a bar with the percentage shaded and tick marks every tenth, so the
// question is "how much of this bar is lit" rather than a formula to recall.

import { clamp, easeOutCubic, roundRect, toInt } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

const BAR_W = 190;
const BAR_H = 30;

export class PercentBeast extends Beast {
  constructor(pct, total, x, y, speed) {
    super(x, y, speed);
    this.pct = pct;
    this.total = total;
    this.value = Math.round((pct / 100) * total);
    this.hue = theme.hostile + 26;
    this.dieFor = 0.5;
    this.w = BAR_W + 34;
    this.h = BAR_H + 52;
  }

  get magnitude() { return Math.max(8, this.value * 1.5); }
  get promptText() { return `${this.pct}% of ${this.total}`; }
  get concept() { return 'percent'; }
  get hintText() { return `${this.promptText} =`; }
  get answerText() { return String(this.value); }
  accepts(raw) { return toInt(raw) === this.value; }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    particles.burst(this.x, this.y, 34, {
      hue: 44, speed: 320, life: 0.8, size: 4, grav: 150, stretch: 0.9,
      glyphs: this.answerText.split(''),
    });
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    ctx.save();
    if (dying) ctx.globalAlpha = 1 - easeOutCubic(dieP);
    this.drawShell(ctx, isTarget && !dying, this.w * 0.58);

    const x0 = this.x - this.w / 2;
    const y0 = this.y - this.h / 2;
    ctx.save();
    roundRect(ctx, x0, y0, this.w, this.h, 12);
    ctx.fillStyle = `hsla(${this.hue}, 45%, 9%, 0.86)`;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `hsla(${this.hue}, 80%, 58%, ${this.hitFlash > 0 ? 1 : 0.5})`;
    ctx.stroke();
    ctx.restore();

    const bx = this.x - BAR_W / 2;
    const by = this.y - BAR_H / 2 + 8;

    ctx.save();
    ctx.fillStyle = 'rgba(10,16,30,0.9)';
    roundRect(ctx, bx, by, BAR_W, BAR_H, 6);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, bx, by, BAR_W, BAR_H, 6);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const lit = BAR_W * (this.pct / 100);
    const g = ctx.createLinearGradient(bx, 0, bx + lit, 0);
    g.addColorStop(0, `hsla(${this.hue}, 100%, 52%, 0.85)`);
    g.addColorStop(1, `hsla(${this.hue + 20}, 100%, 62%, 0.95)`);
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, lit, BAR_H);
    ctx.restore();

    // A tick every 10%, so the shaded run can be counted off.
    ctx.strokeStyle = 'rgba(200,225,250,0.32)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const tx = bx + (BAR_W * i) / 10;
      ctx.beginPath();
      ctx.moveTo(tx, by + (i === 5 ? 0 : BAR_H * 0.45));
      ctx.lineTo(tx, by + BAR_H);
      ctx.stroke();
    }
    ctx.strokeStyle = `hsla(${this.hue}, 90%, 70%, 0.8)`;
    ctx.lineWidth = 1.6;
    roundRect(ctx, bx, by, BAR_W, BAR_H, 6);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = '600 14px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(220,238,252,0.85)';
    ctx.fillText(`whole = ${this.total}`, this.x, by + BAR_H + 18);
    ctx.restore();

    if (!dying) this.drawLabel(ctx, this.promptText, 24);
    ctx.restore();
  }
}

// Kept to whole-number answers: the skill being drilled is the proportion, not
// decimal rounding.
const WHOLES = [20, 40, 50, 60, 80, 100, 120, 140, 150, 160, 180, 200, 240, 300];

export function makePercent(wave) {
  const pcts = [50, 10, 25, 20, 75, 5, 30, 40, 15, 60, 80];
  const cap = clamp(4 + Math.floor(wave / 2), 4, pcts.length);
  const pct = pcts[Math.floor(Math.random() * cap)];
  // Round wholes only, and only ones this percentage divides exactly.
  const fits = WHOLES.filter((t) => (pct * t) % 100 === 0);
  return { pct, total: fits[Math.floor(Math.random() * fits.length)] };
}
