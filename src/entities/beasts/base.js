// Shared behaviour for everything that descends on the planet.
//
// Subclasses own their body art, the text they show, and what counts as a
// correct answer. The base owns motion, damage reaction, the death timer and
// the landing beam, so every beast type reacts to the game the same way.

import { TAU, rand, clamp, easeOutCubic } from '../../util.js';
import { theme } from '../../theme.js';

// How long a beast spends closing from far off, and how small it starts.
// Short enough that it never feels like a wait, long enough to be an arrival.
const ARRIVE = 0.7;
const FAR = 0.26;

let nextId = 1;

export class Beast {
  constructor(x, y, speed) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.speed = speed;
    this.state = 'alive';           // alive | dying | dead
    this.t = 0;
    this.dieT = 0;
    this.dieFor = 0.55;             // subclasses may lengthen their death
    this.hitFlash = 0;
    this.lurch = 0;
    this.locked = false;
    this.bornAt = performance.now() / 1000;
    this.phase = rand(TAU);
    this.hue = theme.hostile + rand(16, -6);
    this.rises = false;
    this.w = 60; this.h = 60;
    // Already here, unless something explicitly sends it through a seam.
    // Arrival belongs to spawning, not to construction: a Kraken arm held in
    // orbit or a beast placed by a test has not travelled from anywhere, and
    // shrinking it in would be a lie about where it came from.
    this.arriveT = ARRIVE;
  }

  get bottom() { return this.y + this.h / 2; }
  get top() { return this.y - this.h / 2; }
  get alive() { return this.state === 'alive'; }
  get gone() { return this.state === 'dead'; }

  // The arrival.
  //
  // Beasts used to spawn at y = -80 to -200, entirely off screen, and drift in.
  // That made their first *legible* moment three to eight seconds after they
  // existed -- and since targeting reads the whole list, a quick player could
  // answer a problem off the HUD without ever having seen the thing carrying
  // it. So they arrive on screen instead, small and far off, and close.
  //
  // Nothing is lost by the delay: the beast descends normally throughout, so
  // it is simply visible sooner than it used to be readable.
  get arriving() { return this.arriveT < ARRIVE; }
  // 0 = just materialised and far off, 1 = fully here.
  get arrival() { return clamp(this.arriveT / ARRIVE, 0, 1); }
  // Scale it is drawn at while closing. Not applied to hit tests: a beast that
  // cannot be answered yet should not be clickable either.
  get arriveScale() { return FAR + (1 - FAR) * easeOutCubic(this.arrival); }
  // Answerable only once it is here. This is the guard that stops a problem
  // being solved off the readout before the beast is on screen.
  get ready() { return this.alive && !this.arriving; }

  // Numeric weight of this problem; drives explosion size, orb payout and the
  // register of the kill tone.
  get magnitude() { return 12; }

  // Shown on the beast itself.
  get promptText() { return ''; }

  // Which operation this beast's (a, b) pair belongs to, for the skill table.
  get factOp() { return '×'; }

  // Which part of the curriculum this beast belongs to. The progress ledger
  // groups by it, so a beast without one would be invisible to a parent.
  get concept() { return 'other'; }
  // Shown beside the answer box, e.g. "7 × 8 =".
  get hintText() { return `${this.promptText} =`; }

  // Raw typed string -> is it right?
  accepts() { return false; }
  // Canonical answer, used to build multiple-choice options.
  get answerText() { return ''; }

  // Called on a correct answer. Return true if the beast dies outright; a
  // subclass that transforms instead (splitting, cracking a shell) returns false.
  resolve() { this.kill(); return true; }

  kill() {
    if (this.state !== 'alive') return;
    this.state = 'dying';
    this.dieT = 0;
  }

  repel() {
    this.hitFlash = 1;
    this.lurch = 26;
  }

  update(dt) {
    this.t += dt;
    if (this.state === 'alive') this.arriveT += dt;
    if (this.state === 'dying') {
      this.dieT += dt;
      if (this.dieT >= this.dieFor) this.state = 'dead';
      return;
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    if (this.lurch > 0) {
      const step = Math.min(this.lurch, 140 * dt);
      this.y += this.rises ? -step : step;
      this.lurch -= step;
    }
    this.y += (this.rises ? -this.speed : this.speed) * dt;
    this.x += Math.sin(this.t * 1.1 + this.phase) * 8 * dt;
  }

  // 0 = just spawned, 1 = about to do its damage.
  progress(shield) {
    if (this.rises) return clamp(1 - this.top / 760, 0, 1);
    const ground = shield.domeY(this.x);
    return clamp((this.bottom + 80) / (ground + 80), 0, 1);
  }

  // Has it arrived? Descending beasts hit the dome; risers escape off the top.
  arrived(shield) {
    return this.rises ? this.bottom < -20 : this.bottom >= shield.domeY(this.x);
  }

  emitCollapse() {}

  // Shared shell + halo, drawn under the subclass body.
  // A tapered plume behind the descent. Beasts fall slowly enough at low waves
  // that without one they read as static objects being teleported downward.
  // Drawn from speed rather than a position history: no per-frame allocation,
  // and it lengthens as the wave gets faster, which is the useful signal.
  drawTrail(ctx, radius) {
    if (this.state !== 'alive' || this.speed < 8) return;
    const len = Math.min(150, 26 + this.speed * 0.85);
    const dir = this.rises ? 1 : -1;              // the plume is behind, not ahead
    const y0 = this.y + dir * radius * 0.5;
    const y1 = y0 + dir * len;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(this.x, y0, this.x, y1);
    g.addColorStop(0, `hsla(${this.hue}, 95%, 62%, 0.24)`);
    g.addColorStop(1, `hsla(${this.hue}, 95%, 55%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(this.x - radius * 0.42, y0);
    ctx.lineTo(this.x + radius * 0.42, y0);
    // A slight sway so the plume follows the beast's drift rather than hanging
    // dead straight behind it.
    ctx.lineTo(this.x + Math.sin(this.t * 1.1 + this.phase) * 9, y1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawShell(ctx, isTarget, radius) {
    this.drawTrail(ctx, radius);
    const flash = this.hitFlash;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gh = flash > 0 ? 0 : this.hue;
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius * 1.9);
    g.addColorStop(0, `hsla(${gh}, 95%, 60%, ${0.3 + flash * 0.35})`);
    g.addColorStop(1, `hsla(${gh}, 95%, 50%, 0)`);
    ctx.fillStyle = g;
    const r = radius * 2;
    ctx.fillRect(this.x - r, this.y - r, r * 2, r * 2);
    ctx.restore();

    if (isTarget) {
      // Rotating reticle so the active beast is unmistakable.
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.t * 0.7);
      ctx.strokeStyle = `hsla(48, 100%, 68%, ${0.55 + Math.sin(this.t * 9) * 0.25})`;
      ctx.lineWidth = 2;
      const rr = radius * 1.32;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, rr, i * (TAU / 4) + 0.35, i * (TAU / 4) + TAU / 4 - 0.35);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawLabel(ctx, text, size = 30) {
    const y0 = this.y - this.h / 2;
    const below = y0 < 52;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = below ? 'top' : 'bottom';
    ctx.font = `700 ${size}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.shadowColor = `hsla(${this.hue}, 100%, 60%, 0.9)`;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff5d6';
    ctx.fillText(text, this.x, below ? y0 + this.h + 16 : y0 - 14);
    ctx.restore();
  }

  // Marks where this beast will touch down.
  drawBeam(ctx, groundY, t) {
    if (this.state !== 'alive' || this.rises) return;
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
