// Flat-array particle pool. Particles are drawn additively so dense bursts
// blow out into the bloom pass instead of muddying.

import { rand, TAU } from '../util.js';

const MAX = 4000;

export class Particles {
  constructor() {
    this.n = 0;
    this.scale = 1;   // set by the quality manager; thins bursts on slow machines
    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.hue = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.rot = new Float32Array(MAX);
    this.spin = new Float32Array(MAX);
    this.glyph = new Array(MAX).fill(null);   // digit fragments, when present
  }

  spawn(o) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.x[i] = o.x; this.y[i] = o.y;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0;
    this.max[i] = this.life[i] = o.life || 0.6;
    this.size[i] = o.size || 3;
    this.hue[i] = o.hue == null ? 190 : o.hue;
    this.drag[i] = o.drag == null ? 1.6 : o.drag;
    this.grav[i] = o.grav == null ? 0 : o.grav;
    this.rot[i] = o.rot || 0;
    this.spin[i] = o.spin || 0;
    this.glyph[i] = o.glyph || null;
  }

  // Radial burst. `glyphs` scatters digit fragments of the number destroyed --
  // the debris is literally made of the number you just solved.
  burst(x, y, count, opts = {}) {
    count = Math.max(3, Math.round(count * this.scale));
    const hue = opts.hue == null ? 190 : opts.hue;
    const speed = opts.speed || 300;
    for (let i = 0; i < count; i++) {
      const a = rand(TAU);
      const s = rand(speed, speed * 0.15);
      this.spawn({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(opts.life || 0.8, (opts.life || 0.8) * 0.35),
        size: rand(opts.size || 4, 1.2),
        hue: hue + rand(24, -24),
        drag: opts.drag == null ? 1.9 : opts.drag,
        grav: opts.grav || 0,
        glyph: opts.glyphs ? opts.glyphs[(Math.random() * opts.glyphs.length) | 0] : null,
        rot: rand(TAU),
        spin: rand(6, -6),
      });
    }
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.n;
        if (i !== last) {
          for (const arr of [this.x, this.y, this.vx, this.vy, this.life, this.max,
                             this.size, this.hue, this.drag, this.grav, this.rot, this.spin]) {
            arr[i] = arr[last];
          }
          this.glyph[i] = this.glyph[last];
        }
        i--;
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.spin[i] * dt;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.n; i++) {
      const t = this.life[i] / this.max[i];
      const a = t * t;
      const s = this.size[i] * (0.4 + t * 0.6);
      if (this.glyph[i]) {
        ctx.save();
        ctx.translate(this.x[i], this.y[i]);
        ctx.rotate(this.rot[i]);
        ctx.font = `700 ${(s * 4.5).toFixed(1)}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `hsla(${this.hue[i]}, 100%, ${58 + t * 30}%, ${a})`;
        ctx.fillText(this.glyph[i], 0, 0);
        ctx.restore();
      } else {
        ctx.fillStyle = `hsla(${this.hue[i]}, 100%, ${55 + t * 35}%, ${a})`;
        ctx.beginPath();
        ctx.arc(this.x[i], this.y[i], s, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  clear() { this.n = 0; }
}
