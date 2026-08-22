// A number asteroid. Hit a composite with any proper factor and it fractures
// into two chunks whose sizes are physically proportional to those factors --
// 48 struck with 6 becomes a 6 and an 8, and the 8 is visibly the larger rock.
//
// Primes glow red, carry a crystalline core and refuse to split. The only way
// to destroy one is to name it: type the number itself. Nobody has to be told
// what a prime is; the rock teaches it by being unbreakable.

import { TAU, rand, clamp, isPrime, properFactors, easeOutCubic, toInt, parsePair } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

const radiusFor = (n) => clamp(16 + Math.sqrt(n) * 5.2, 20, 74);

export class SplitBeast extends Beast {
  constructor(n, x, y, speed) {
    super(x, y, speed);
    this.n = n;
    this.prime = isPrime(n);
    this.revealed = false;      // set once a player has tried to factor a prime
    this.r = radiusFor(n);
    this.w = this.r * 2;
    this.h = this.r * 2;
    this.hue = this.prime ? 352 : theme.hostile + 16;
    this.spin = rand(0.5, -0.5);
    this.dieFor = 0.5;
    // A fixed irregular silhouette so each rock looks hewn rather than round.
    this.verts = [];
    const n8 = 11;
    for (let i = 0; i < n8; i++) {
      this.verts.push({ a: (i / n8) * TAU, r: rand(1.12, 0.84) });
    }
    // Seam lines hint at where a composite will break.
    this.seams = this.prime ? [] : [rand(TAU), rand(TAU), rand(TAU)];
  }

  get magnitude() { return this.n; }

  // The bare number is not a question. Every rock states its own task above it,
  // so a player can read what to do without hunting for the HUD -- and so
  // non-targeted rocks are legible too.
  get promptText() {
    if (this.prime && this.revealed) return `${this.n} is PRIME`;
    return `? × ? = ${this.n}`;
  }

  get hintText() {
    if (this.prime && this.revealed) return `no factors — type ${this.n}:`;
    return `one factor of ${this.n}, or both =`;
  }
  get answerText() {
    if (this.prime) return String(this.n);
    const f = properFactors(this.n);
    return String(f[Math.floor(f.length / 2)]);
  }

  // The rock asks "? × ? = 48", so both halves of that are valid answers: a
  // single factor, or the whole pair. A pair is checked on its product, so
  // 12×9 is wrong for 48 even though 12 on its own would have been right.
  accepts(raw) {
    const pair = parsePair(raw);
    if (pair) {
      if (this.prime) return false;      // no pair above 1 multiplies to a prime
      const [a, b] = pair;
      return a > 1 && b > 1 && a * b === this.n;
    }
    const v = toInt(raw);
    if (v == null) return false;
    if (this.prime) return v === this.n;
    return v > 1 && v < this.n && this.n % v === 0;
  }

  // A composite doesn't die -- it becomes two smaller rocks. The caller reads
  // `children` and adds them to the field.
  resolve(raw) {
    if (this.prime) { this.kill(); return true; }
    const pair = parsePair(raw);
    const f = pair ? pair[0] : toInt(raw);
    const g = this.n / f;
    this.children = [f, g].filter((v) => v > 1);
    this.kill();
    return true;
  }

  _path(ctx, scale = 1) {
    ctx.beginPath();
    for (let i = 0; i < this.verts.length; i++) {
      const v = this.verts[i];
      const a = v.a + this.t * this.spin;
      const rr = this.r * v.r * scale;
      const px = this.x + Math.cos(a) * rr;
      const py = this.y + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    particles.burst(this.x, this.y, this.prime ? 34 : 22, {
      hue: this.prime ? 352 : 32, speed: 260 + this.r * 4,
      life: 0.8, size: 4, grav: 160, stretch: 0.9,
      glyphs: String(this.n).split(''),
    });
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    ctx.save();
    if (dying) ctx.globalAlpha = 1 - easeOutCubic(dieP);

    this.drawShell(ctx, isTarget && !dying, this.r * 1.15);

    // Body.
    this._path(ctx);
    const g = ctx.createRadialGradient(
      this.x - this.r * 0.3, this.y - this.r * 0.4, this.r * 0.1,
      this.x, this.y, this.r * 1.1,
    );
    g.addColorStop(0, `hsla(${this.hue}, 55%, ${this.prime ? 26 : 30}%, 0.98)`);
    g.addColorStop(1, `hsla(${this.hue}, 60%, 8%, 0.98)`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `hsla(${this.hue}, 95%, ${this.prime ? 62 : 52}%, ${this.hitFlash > 0 ? 1 : 0.7})`;
    ctx.stroke();

    // Composites show fracture seams; primes show an unbreakable core.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (this.prime) {
      const pulse = 0.6 + Math.sin(this.t * 4 + this.phase) * 0.4;
      const cg = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 0.85);
      cg.addColorStop(0, `hsla(352, 100%, 72%, ${0.5 + pulse * 0.35})`);
      cg.addColorStop(1, 'hsla(352, 100%, 50%, 0)');
      ctx.fillStyle = cg;
      ctx.fillRect(this.x - this.r, this.y - this.r, this.r * 2, this.r * 2);
      ctx.strokeStyle = `hsla(352, 100%, 78%, ${0.5 + pulse * 0.3})`;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const a = this.t * 0.6 + (i / 3) * TAU;
        ctx.beginPath();
        ctx.moveTo(this.x + Math.cos(a) * this.r * 0.18, this.y + Math.sin(a) * this.r * 0.18);
        ctx.lineTo(this.x + Math.cos(a) * this.r * 0.72, this.y + Math.sin(a) * this.r * 0.72);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = `hsla(38, 100%, 66%, 0.32)`;
      ctx.lineWidth = 1.3;
      for (const s of this.seams) {
        const a = s + this.t * this.spin;
        ctx.beginPath();
        ctx.moveTo(this.x + Math.cos(a) * this.r * 0.95, this.y + Math.sin(a) * this.r * 0.95);
        ctx.lineTo(this.x - Math.cos(a) * this.r * 0.95, this.y - Math.sin(a) * this.r * 0.95);
        ctx.stroke();
      }
    }
    ctx.restore();

    if (!dying) this.drawLabel(ctx, this.promptText, 24);

    // The number, carved into the rock.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(this.r * 0.82)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.shadowColor = `hsla(${this.hue}, 100%, 62%, 0.95)`;
    ctx.shadowBlur = 16;
    ctx.fillStyle = this.prime ? '#ffe3e8' : '#ffeccf';
    ctx.fillText(String(this.n), this.x, this.y + 1);
    ctx.restore();

    ctx.restore();
  }
}
