// A negative. Voidlings rise instead of falling, and they are drawn as holes
// rather than objects -- a dark disc with a bright rim, inverted against
// everything else on screen.
//
// You neutralise one by firing its additive inverse. Let it escape off the top
// and it takes a shield plate with it, so a negative left alone subtracts.

import { TAU, rand, clamp, easeOutCubic , toInt } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

export class Voidling extends Beast {
  constructor(value, x, y, speed) {
    super(x, y, speed);
    this.value = value;                 // stored positive; displayed negative
    this.r = 24 + Math.min(value, 12) * 1.8;
    this.w = this.r * 2;
    this.h = this.r * 2;
    this.rises = true;
    this.hue = theme.void;
    this.dieFor = 0.45;
  }

  get magnitude() { return this.value * 2.5; }
  // Stated above the orb, so the task is readable whether or not it is the
  // current target.
  get promptText() { return `−${this.value} + ? = 0`; }
  get concept() { return 'inverse'; }
  get hintText() { return `−${this.value} + ? =`; }
  get faceText() { return `−${this.value}`; }
  get answerText() { return String(this.value); }
  accepts(raw) { return toInt(raw) === this.value; }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    // Annihilation implodes rather than explodes: particles fly inward.
    for (let i = 0; i < 30; i++) {
      const a = rand(TAU);
      const d = this.r * rand(3.2, 1.4);
      particles.spawn({
        x: this.x + Math.cos(a) * d,
        y: this.y + Math.sin(a) * d,
        vx: -Math.cos(a) * 420, vy: -Math.sin(a) * 420,
        life: rand(0.4, 0.22), size: rand(3.6, 1.5),
        hue: 280 + rand(40), drag: 0.6, stretch: 1,
      });
    }
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    ctx.save();
    if (dying) {
      const s = 1 - easeOutCubic(dieP);
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
    }

    this.drawShell(ctx, isTarget && !dying, this.r * 1.3);

    // A hole: solid dark fill that occludes the starfield behind it.
    ctx.save();
    ctx.fillStyle = 'rgba(3,2,10,0.97)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Rim light, and a counter-rotating accretion ring.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.6 + Math.sin(this.t * 3 + this.phase) * 0.4;
    ctx.strokeStyle = `hsla(${this.hue}, 100%, ${72 + pulse * 18}%, 0.9)`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = `hsla(${this.hue + 24}, 100%, 70%, 0.35)`;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r * (1.22 + i * 0.16), this.r * 0.3,
                  -this.t * (0.9 + i * 0.3), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(this.r * 0.86)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.shadowColor = `hsla(${this.hue}, 100%, 70%, 0.95)`;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#eadcff';
    ctx.fillText(this.faceText, this.x, this.y + 1);
    ctx.restore();

    if (!dying) this.drawLabel(ctx, this.promptText, 22);
    ctx.restore();
  }

  // Risers point their beam up, at the sky they are escaping into.
  drawBeam(ctx, _groundY, t) {
    if (this.state !== 'alive') return;
    const bottom = this.top - 4;
    if (bottom <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, bottom, 0, 0);
    g.addColorStop(0, `hsla(${this.hue}, 100%, 66%, 0.18)`);
    g.addColorStop(1, `hsla(${this.hue}, 100%, 60%, 0.01)`);
    ctx.fillStyle = g;
    const wob = Math.sin(t * 3 + this.phase) * 4;
    ctx.beginPath();
    ctx.moveTo(this.x - 8, bottom);
    ctx.lineTo(this.x + 8, bottom);
    ctx.lineTo(this.x + 24 + wob, 0);
    ctx.lineTo(this.x - 24 + wob, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
