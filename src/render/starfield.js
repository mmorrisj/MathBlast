// Parallax backdrop: nebula wash + three star layers that drift at different
// rates. Cheap depth cue that makes the descent read as motion toward a surface.
//
// The gradient wash is baked into a half-resolution cache and only re-rendered
// when the danger level moves or a fifth of a second has passed -- the nebula
// breathes at 0.35Hz, so nobody can see the update rate, and it turns three
// full-screen gradient fills per frame into one scaled blit.

import { rand, TAU } from '../util.js';
import { theme } from '../theme.js';

const BAKE_INTERVAL = 0.2;

export class Starfield {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.layers = [
      { n: 130, speed: 4, size: 0.9, alpha: 0.45, stars: [] },
      { n: 70, speed: 11, size: 1.5, alpha: 0.7, stars: [] },
      { n: 30, speed: 26, size: 2.4, alpha: 1.0, stars: [] },
    ];
    for (const L of this.layers) {
      for (let i = 0; i < L.n; i++) {
        L.stars.push({ x: rand(w), y: rand(h), tw: rand(TAU), hue: rand(230, 170) });
      }
    }
    this.t = 0;

    // Full resolution so the per-frame blit is a straight 1:1 copy -- scaled
    // blits cost noticeably more on software rasterisers than unscaled ones.
    this.bg = document.createElement('canvas');
    this.bg.width = w;
    this.bg.height = h;
    this.bgCtx = this.bg.getContext('2d');
    // Half-resolution blurred copy for the slow-motion depth of field. Blurring
    // a full-resolution image every frame costs ~16ms on a software rasteriser;
    // baking it alongside the sharp copy makes the effect essentially free.
    this.bgBlur = document.createElement('canvas');
    this.bgBlur.width = Math.floor(w / 2);
    this.bgBlur.height = Math.floor(h / 2);
    this.bakedDanger = -1;
    this.bakedAt = -Infinity;
  }

  update(dt) {
    this.t += dt;
    for (const L of this.layers) {
      for (const s of L.stars) {
        s.y += L.speed * dt;
        if (s.y > this.h) { s.y -= this.h; s.x = rand(this.w); }
      }
    }
  }

  _bake(danger) {
    this.bakedEnv = theme.env;
    const ctx = this.bgCtx;
    const w = this.bg.width, h = this.bg.height;

    if (!this._grad) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#05060f');
      g.addColorStop(0.55, '#080a1c');
      g.addColorStop(1, '#0c0a22');
      this._grad = g;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this._grad;
    ctx.fillRect(0, 0, w, h);

    // Two slow-breathing radial blooms. The base hue drifts by wave (deep blue
    // through violet to ember) and pushes further warm as danger rises.
    ctx.globalCompositeOperation = 'lighter';
    const hue = theme.env + danger * 24;
    for (const [cx, cy, r, a] of [
      [w * 0.24, h * 0.3, h * 0.55, 0.16],
      [w * 0.78, h * 0.52, h * 0.45, 0.12],
    ]) {
      const pulse = 1 + Math.sin(this.t * 0.35 + cx) * 0.06;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * pulse);
      g.addColorStop(0, `hsla(${hue}, 80%, 55%, ${a * (1 + danger)})`);
      g.addColorStop(1, `hsla(${theme.env}, 80%, 50%, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';

    const bc = this.bgBlur.getContext('2d');
    const bw = this.bgBlur.width, bh = this.bgBlur.height;
    bc.globalCompositeOperation = 'source-over';
    bc.clearRect(0, 0, bw, bh);
    if (bc.filter !== undefined) bc.filter = 'blur(3px)';
    bc.drawImage(this.bg, 0, 0, bw, bh);
    bc.filter = 'none';

    this.bakedDanger = danger;
    this.bakedAt = this.t;
  }

  draw(ctx, danger, starScale = 1, blur = 0) {
    const bucket = Math.round(danger * 8) / 8;
    if (bucket !== this.bakedDanger || theme.env !== this.bakedEnv ||
        this.t - this.bakedAt > BAKE_INTERVAL) this._bake(bucket);

    // Depth of field: during the near-miss the backdrop goes soft while the
    // beasts and the dome stay sharp, so the eye is pushed onto the problem.
    if (blur > 0.01) {
      if (blur < 0.98) ctx.drawImage(this.bg, 0, 0);
      ctx.save();
      ctx.globalAlpha = Math.min(1, blur);
      ctx.drawImage(this.bgBlur, 0, 0, this.w, this.h);
      ctx.restore();
    } else {
      ctx.drawImage(this.bg, 0, 0);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - blur * 0.55;
    for (const L of this.layers) {
      const count = Math.floor(L.stars.length * starScale);
      for (let i = 0; i < count; i++) {
        const s = L.stars[i];
        const tw = 0.65 + Math.sin(this.t * 2.4 + s.tw) * 0.35;
        const r = L.size * tw;
        ctx.fillStyle = `hsla(${s.hue}, 90%, 82%, ${L.alpha * tw})`;
        ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }
}
