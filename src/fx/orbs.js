// Energy orbs released when a beast is solved. They scatter, then arc down into
// the shield dome and are absorbed, each one depositing a share of a plate.
//
// This is the visual that carries the game's central idea: the answer you got
// right becomes, visibly, the thing that protects you later. Orb count and size
// scale with the magnitude of the problem, so a hard fact pays out as a bigger,
// slower, more luminous delivery than an easy one.

import { TAU, clamp, rand, easeOutCubic } from '../util.js';

const SCATTER = 0.28;     // seconds of outward drift before they home
const MAX = 220;

export class Orbs {
  constructor() {
    this.list = [];
  }

  // `power` ~0.4..1.6. Returns the number spawned.
  spawn(x, y, power, targetFor, hue = 172) {
    const n = clamp(Math.round(2 + power * 5), 2, 9);
    // Tuned so a full dome takes most of a good run rather than the first
    // twenty answers -- it should read as a long-term achievement.
    const totalEnergy = 0.26 + power * 0.4;
    for (let i = 0; i < n; i++) {
      if (this.list.length >= MAX) break;
      const a = (i / n) * TAU + rand(0.5, -0.5);
      const sp = rand(280, 120) * (0.6 + power * 0.5);
      const tx = targetFor(x + rand(70, -70));
      this.list.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        tx: tx.x, ty: tx.y,
        t: 0,
        scatter: SCATTER + rand(0.16),
        energy: totalEnergy / n,
        size: (3.4 + power * 4.2) * rand(1.25, 0.8),
        hue: hue + rand(16, -16),
        wobble: rand(TAU),
        trail: [],
        done: false,
      });
    }
    return n;
  }

  // `onArrive(orb)` fires as each orb reaches the dome.
  update(dt, onArrive) {
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i];
      o.t += dt;

      if (o.t < o.scatter) {
        // Outward drift, slowing.
        const d = Math.exp(-3.4 * dt);
        o.vx *= d;
        o.vy = o.vy * d + 90 * dt;
      } else {
        // Steer toward the dome, accelerating the whole way so arrival snaps.
        const dx = o.tx - o.x, dy = o.ty - o.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = 900 + easeOutCubic(clamp((o.t - o.scatter) / 0.7, 0, 1)) * 2600;
        o.vx += (dx / dist) * pull * dt;
        o.vy += (dy / dist) * pull * dt;
        // Slight perpendicular sway so the paths curve instead of running straight.
        const sway = Math.sin(o.t * 5 + o.wobble) * 130;
        o.vx += (-dy / dist) * sway * dt;
        o.vy += (dx / dist) * sway * dt;
        const drag = Math.exp(-2.2 * dt);
        o.vx *= drag; o.vy *= drag;

        if (dist < 18) {
          onArrive(o);
          this.list[i] = this.list[this.list.length - 1];
          this.list.pop();
          i--;
          continue;
        }
      }

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      o.trail.push(o.x, o.y);
      if (o.trail.length > 14) o.trail.splice(0, 2);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (const o of this.list) {
      const pts = o.trail;
      for (let i = 2; i < pts.length; i += 2) {
        const a = (i / pts.length) ** 2;
        ctx.strokeStyle = `hsla(${o.hue}, 100%, 66%, ${a * 0.4})`;
        ctx.lineWidth = o.size * a * 0.9;
        ctx.beginPath();
        ctx.moveTo(pts[i - 2], pts[i - 1]);
        ctx.lineTo(pts[i], pts[i + 1]);
        ctx.stroke();
      }

      const pulse = 1 + Math.sin(o.t * 14 + o.wobble) * 0.12;
      const r = o.size * pulse;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 3.6);
      g.addColorStop(0, `hsla(${o.hue}, 100%, 92%, 0.95)`);
      g.addColorStop(0.28, `hsla(${o.hue}, 100%, 68%, 0.55)`);
      g.addColorStop(1, `hsla(${o.hue}, 100%, 55%, 0)`);
      ctx.fillStyle = g;
      const rr = r * 3.6;
      ctx.fillRect(o.x - rr, o.y - rr, rr * 2, rr * 2);

      ctx.fillStyle = `hsla(${o.hue}, 100%, 97%, 0.95)`;
      ctx.beginPath();
      ctx.arc(o.x, o.y, r * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  clear() { this.list.length = 0; }
  get count() { return this.list.length; }
}
