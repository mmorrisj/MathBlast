// Expanding pressure rings. Every ring is drawn three times at slightly
// different radii in red/green/blue and composited additively, which reads as a
// lens distortion without ever sampling the canvas back -- a real refraction
// pass costs a full-resolution readback per ring, and these can stack.
//
// Ring count, radius and thickness all scale with the magnitude of the problem
// that produced them, so a 12x12 blast is visibly a bigger event than a 2x3.

import { TAU, clamp, easeOutQuint, easeOutCubic } from '../util.js';

const MAX = 30;

export class Shockwaves {
  constructor() {
    this.list = [];
  }

  // `power` is roughly 0.4 (small fact) .. 1.6 (boss). Everything scales off it.
  // `opts.rings` and `opts.radius` override the magnitude-derived defaults, for
  // small accents (a plate locking in) that should not read as an explosion.
  spawn(x, y, power, opts = {}) {
    if (this.list.length >= MAX) this.list.shift();
    const rings = opts.rings == null ? Math.max(1, Math.round(1 + power * 2)) : opts.rings;
    // Capped: past about half the screen a ring stops reading as an explosion
    // and starts reading as a UI element sweeping the playfield.
    const baseR = opts.radius == null ? Math.min(90 + power * 300, 520) : opts.radius;
    const hue = opts.hue == null ? 40 : opts.hue;
    for (let i = 0; i < rings; i++) {
      this.list.push({
        x, y,
        t: -i * 0.055,                       // stagger so rings chase each other
        life: (0.5 + power * 0.42) * (1 - i * 0.12),
        rMax: baseR * (1 - i * 0.16),
        width: (opts.width == null ? 3 + power * 9 : opts.width) * (1 - i * 0.22),
        hue: hue + i * 8,
        split: (1.5 + power * 5) * (opts.split == null ? 1 : opts.split),
        flash: i === 0 && opts.flash !== false ? 1 : 0,   // leading ring only
      });
    }
  }

  update(dt) {
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i];
      s.t += dt;
      if (s.t >= s.life) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
        i--;
      }
    }
  }

  draw(ctx, chromatic = true) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.list) {
      if (s.t < 0) continue;
      const p = clamp(s.t / s.life, 0, 1);
      const r = easeOutQuint(p) * s.rMax;
      const fade = (1 - p) ** 2;
      if (r < 1 || fade < 0.004) continue;

      // Core flash: a bright bloom at the origin for the first instant.
      if (s.flash && p < 0.22) {
        const f = 1 - p / 0.22;
        // Capped: a big blast should read as a big blast, not paint the
        // collapsing lattice out of the frame.
        const rr = Math.min(s.rMax * 0.34, 132) * f;
        if (rr > 1) {
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rr);
          g.addColorStop(0, `hsla(${s.hue + 14}, 100%, ${70 + f * 25}%, ${0.55 * f})`);
          g.addColorStop(1, `hsla(${s.hue}, 100%, 60%, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(s.x - rr, s.y - rr, rr * 2, rr * 2);
        }
      }

      ctx.lineWidth = s.width * (1 - easeOutCubic(p) * 0.62);
      if (chromatic) {
        // Red trails, cyan leads: the classic lens-fringe direction.
        const off = s.split * (0.35 + p);
        ctx.strokeStyle = `hsla(0, 100%, 62%, ${fade * 0.4})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, r - off), 0, TAU); ctx.stroke();
        ctx.strokeStyle = `hsla(185, 100%, 66%, ${fade * 0.4})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, r + off, 0, TAU); ctx.stroke();
      }
      ctx.strokeStyle = `hsla(${s.hue}, 100%, 74%, ${fade * 0.7})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  clear() { this.list.length = 0; }
}
