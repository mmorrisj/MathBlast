// Camera, screen shake, and the time-scale system that owns hitstop + slow motion.

import { clamp, damp, rand } from '../util.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.zoom = 1;
    this.targetZoom = 1; this.targetX = 0; this.targetY = 0;
    this.trauma = 0;         // 0..1; shake is trauma^2 so small knocks stay subtle
    this.hitstop = 0;        // remaining real seconds of near-freeze
    this.slowmo = 0;         // 0..1 blend into bullet time
    this.timeScale = 1;
  }

  shake(amount) { this.trauma = clamp(this.trauma + amount, 0, 1); }

  // A brief near-freeze on impact. ~60-80ms is most of what "satisfying" means.
  stop(seconds) { this.hitstop = Math.max(this.hitstop, seconds); }

  punchIn(zoom, x, y) { this.targetZoom = zoom; this.targetX = x; this.targetY = y; }
  release() { this.targetZoom = 1; this.targetX = 0; this.targetY = 0; }

  // `dtReal` is wall-clock. Returns the scaled dt the simulation should use.
  update(dtReal) {
    if (this.hitstop > 0) {
      this.hitstop -= dtReal;
      this.timeScale = 0.02;
    } else {
      this.timeScale = 1 - this.slowmo * 0.68;
    }

    this.trauma = Math.max(0, this.trauma - dtReal * 1.6);
    const t = this.trauma * this.trauma;
    this.shakeX = rand(1, -1) * 26 * t;
    this.shakeY = rand(1, -1) * 26 * t;
    this.shakeRot = rand(1, -1) * 0.035 * t;

    this.zoom = damp(this.zoom, this.targetZoom, 6, dtReal);
    this.x = damp(this.x, this.targetX, 6, dtReal);
    this.y = damp(this.y, this.targetY, 6, dtReal);

    return dtReal * this.timeScale;
  }

  apply(ctx, w, h) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(this.shakeRot);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-w / 2 + this.shakeX - this.x, -h / 2 + this.shakeY - this.y);
  }
}
