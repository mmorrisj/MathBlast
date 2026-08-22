// A descending beast whose body IS its problem: `a x b` renders as an a-by-b
// lattice of glowing cells. A stuck player can literally count the grid, which
// is the whole pedagogical trick -- multiplication looks like area.
//
// Solving it runs a diagonal collapse wave through the lattice, so the kill
// animation is also a visualisation of the array being consumed.

import { TAU, clamp, rand, roundRect, easeOutCubic } from '../util.js';

const CELL = 12;
const GAP = 3;
const PITCH = CELL + GAP;
const COLLAPSE_T = 0.45;

let nextId = 1;

export class Beast {
  constructor(a, b, x, y, speed) {
    this.id = nextId++;
    this.a = a; this.b = b;
    this.answer = a * b;
    this.x = x; this.y = y;
    this.speed = speed;
    this.w = a * PITCH;
    this.h = b * PITCH;
    this.state = 'alive';
    this.t = 0;
    this.dieT = 0;
    this.hitFlash = 0;
    this.lurch = 0;
    this.bornAt = performance.now() / 1000;
    this.phase = rand(TAU);
    // Per-cell shimmer offsets keep the lattice alive without any texture work.
    this.cellPhase = new Float32Array(a * b);
    for (let i = 0; i < a * b; i++) this.cellPhase[i] = rand(TAU);
    this.hue = 6 + rand(18);        // hostile orange-red
  }

  get bottom() { return this.y + this.h / 2; }
  get alive() { return this.state === 'alive'; }
  get gone() { return this.state === 'dead'; }

  kill() {
    if (this.state !== 'alive') return;
    this.state = 'dying';
    this.dieT = 0;
  }

  // Wrong answer: the beast lurches closer and flashes. Cost is proximity, not a scold.
  repel() {
    this.hitFlash = 1;
    this.lurch = 26;
  }

  update(dt) {
    this.t += dt;
    if (this.state === 'dying') {
      this.dieT += dt;
      if (this.dieT >= COLLAPSE_T + 0.18) this.state = 'dead';
      return;
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    if (this.lurch > 0) {
      const step = Math.min(this.lurch, 140 * dt);
      this.y += step;
      this.lurch -= step;
    }
    this.y += this.speed * dt;
    // Slight sway so the descent never looks like a spreadsheet scrolling.
    this.x += Math.sin(this.t * 1.1 + this.phase) * 8 * dt;
  }

  // Normalised collapse time for cell (i, j): a diagonal wave from top-left.
  _cellDeath(i, j) {
    const diag = (i + j) / Math.max(1, this.a + this.b - 2);
    return diag * 0.72 * COLLAPSE_T;
  }

  // Emit embers for cells that extinguished this frame.
  emitCollapse(particles, prevT) {
    if (this.state !== 'dying') return;
    const x0 = this.x - this.w / 2;
    const y0 = this.y - this.h / 2;
    const digits = String(this.answer).split('');
    for (let j = 0; j < this.b; j++) {
      for (let i = 0; i < this.a; i++) {
        const d = this._cellDeath(i, j);
        if (d > prevT && d <= this.dieT) {
          const cx = x0 + i * PITCH + CELL / 2;
          const cy = y0 + j * PITCH + CELL / 2;
          particles.spawn({
            x: cx, y: cy,
            vx: rand(90, -90), vy: rand(40, -170),
            life: rand(0.85, 0.4), size: rand(3.4, 1.6),
            hue: 46 + rand(26), grav: 190,
            glyph: Math.random() < 0.22 ? digits[(Math.random() * digits.length) | 0] : null,
            rot: rand(TAU), spin: rand(7, -7),
          });
        }
      }
    }
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / (COLLAPSE_T + 0.18), 0, 1) : 0;
    const x0 = this.x - this.w / 2;
    const y0 = this.y - this.h / 2;
    const flash = this.hitFlash;

    ctx.save();
    if (dying) {
      // Expand and fade as the lattice comes apart.
      const s = 1 + easeOutCubic(dieP) * 0.16;
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
      ctx.globalAlpha = 1 - easeOutCubic(dieP) * 0.85;
    }

    // Containment halo.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, Math.max(this.w, this.h) * 0.95);
    const gh = flash > 0 ? 0 : this.hue;
    glow.addColorStop(0, `hsla(${gh}, 95%, 60%, ${0.3 + flash * 0.35})`);
    glow.addColorStop(1, `hsla(${gh}, 95%, 50%, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(this.x - this.w * 1.1, this.y - this.h * 1.1, this.w * 2.2, this.h * 2.2);
    ctx.restore();

    // Shell.
    ctx.save();
    roundRect(ctx, x0 - 7, y0 - 7, this.w + 14, this.h + 14, 10);
    ctx.fillStyle = `hsla(${this.hue}, 45%, 9%, 0.85)`;
    ctx.fill();
    ctx.lineWidth = isTarget ? 2.5 : 1.4;
    ctx.strokeStyle = isTarget
      ? `hsla(48, 100%, 68%, ${0.85 + Math.sin(this.t * 9) * 0.15})`
      : `hsla(${this.hue}, 80%, 55%, 0.5)`;
    ctx.stroke();
    ctx.restore();

    // The lattice itself.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < this.b; j++) {
      for (let i = 0; i < this.a; i++) {
        if (dying && this.dieT >= this._cellDeath(i, j)) continue;
        const idx = j * this.a + i;
        const shimmer = 0.72 + Math.sin(this.t * 3.4 + this.cellPhase[idx]) * 0.28;
        const light = flash > 0 ? 88 : 52 + shimmer * 22;
        const hue = flash > 0 ? 0 : this.hue + shimmer * 14;
        ctx.fillStyle = `hsla(${hue}, 100%, ${light}%, ${0.85 * shimmer + 0.15})`;
        roundRect(ctx, x0 + i * PITCH, y0 + j * PITCH, CELL, CELL, 2.5);
        ctx.fill();
      }
    }
    ctx.restore();

    // The problem, above the body -- or below it while the beast is still
    // entering from off-screen, so it is readable the moment the body appears.
    if (!dying) {
      const below = y0 < 46;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = below ? 'top' : 'bottom';
      ctx.font = '700 30px "JetBrains Mono", ui-monospace, monospace';
      ctx.shadowColor = `hsla(${this.hue}, 100%, 60%, 0.9)`;
      ctx.shadowBlur = 18;
      ctx.fillStyle = isTarget ? '#fff5d6' : '#ffd9c8';
      ctx.fillText(`${this.a} × ${this.b}`, this.x, below ? y0 + this.h + 14 : y0 - 14);
      ctx.restore();
    }
    ctx.restore();
  }

  // A wavering beam marking where this beast will touch down. Pure readability:
  // it tells you which part of your shield is about to be hit.
  drawBeam(ctx, groundY, t) {
    if (this.state !== 'alive') return;
    const top = this.bottom + 4;
    if (groundY <= top) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, top, 0, groundY);
    g.addColorStop(0, `hsla(${this.hue}, 100%, 62%, 0.2)`);
    g.addColorStop(1, `hsla(${this.hue}, 100%, 55%, 0.015)`);
    ctx.fillStyle = g;
    const wob = Math.sin(t * 3 + this.phase) * 4;
    ctx.beginPath();
    ctx.moveTo(this.x - 8, top);
    ctx.lineTo(this.x + 8, top);
    ctx.lineTo(this.x + 26 + wob, groundY);
    ctx.lineTo(this.x - 26 + wob, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
