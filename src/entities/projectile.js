// The answer you typed, fired as a physical object. Homes onto the target beast
// so the moment of truth happens at the beast, not in a text box.

import { TAU, clamp, showSigned } from '../util.js';
import { theme } from '../theme.js';

export class Projectile {
  // `value` is the raw typed string, so it works for "42" and for "3/4" alike.
  constructor(x, y, target, value, correct) {
    this.x = x; this.y = y;
    this.target = target;
    this.value = value;
    this.correct = correct;      // resolved at fire time; the bolt just delivers it
    this.speed = 1500;
    this.dead = false;
    this.trail = [];
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    const tx = this.target.x;
    const ty = this.target.y;
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = this.speed * dt;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 12) this.trail.shift();

    if (step >= dist || this.target.gone) {
      this.x = tx; this.y = ty;
      this.dead = true;
      return true;               // arrived
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    return false;
  }

  draw(ctx) {
    const hue = this.correct ? theme.orb : theme.hostile + 12;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Tapered streak. At 1500px/s the samples are ~25px apart, so drawing them
    // as discrete dots reads as a string of beads -- stroke the segments instead.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pts = [...this.trail, { x: this.x, y: this.y }];
    for (let i = 1; i < pts.length; i++) {
      const a = (i / pts.length) ** 2;
      ctx.strokeStyle = `hsla(${hue}, 100%, 68%, ${a * 0.55})`;
      ctx.lineWidth = 2 + a * 11;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }

    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 34);
    g.addColorStop(0, `hsla(${hue}, 100%, 88%, 0.95)`);
    g.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(this.x - 34, this.y - 34, 68, 68);

    ctx.font = `700 ${this.value.length > 3 ? 20 : 26}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(showSigned(this.value), this.x, this.y);
    ctx.restore();
  }
}

// Turret sitting on the dome apex. Tracks the active beast.
export class Turret {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = -Math.PI / 2;
    this.recoil = 0;
    this.charge = 0;
  }

  update(dt, target) {
    this.pulse = (this.pulse || 0) + dt;
    if (target) {
      const want = Math.atan2(target.y - this.y, target.x - this.x);
      let d = want - this.angle;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      this.angle += clamp(d, -7 * dt, 7 * dt);
    }
    this.recoil = Math.max(0, this.recoil - dt * 5);
  }

  fire() { this.recoil = 1; }

  get muzzle() {
    const len = 46 - this.recoil * 12;
    return { x: this.x + Math.cos(this.angle) * len, y: this.y + Math.sin(this.angle) * len };
  }

  draw(ctx, danger, charge = 0) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // Overcharge ring: fills as the player answers faster than their own
    // average, then strobes when the beam is ready.
    if (charge > 0.001) {
      const full = charge >= 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = full ? 4 : 3;
      ctx.strokeStyle = full
        ? `hsla(48, 100%, ${70 + Math.sin(this.pulse * 12) * 22}%, 0.95)`
        : `hsla(${theme.friendly + 20}, 100%, 68%, 0.75)`;
      ctx.beginPath();
      ctx.arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(charge, 1));
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.rotate(this.angle);
    const back = -14 + this.recoil * -8;
    ctx.fillStyle = '#13233f';
    ctx.strokeStyle = `hsla(${theme.friendly}, 100%, 66%, 0.85)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(back, -9);
    ctx.lineTo(40 - this.recoil * 10, -5);
    ctx.lineTo(40 - this.recoil * 10, 5);
    ctx.lineTo(back, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
    g.addColorStop(0, `hsla(${theme.friendly - danger * 60}, 100%, 70%, 0.7)`);
    g.addColorStop(1, `hsla(${theme.friendly}, 100%, 60%, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, 80, 80);

    ctx.fillStyle = '#dff8ff';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
