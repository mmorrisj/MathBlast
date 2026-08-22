// A boss shell built from one equation, cracked one step at a time.
//
// The steps are supplied rather than hardcoded, so each difficulty tier poses
// the equation its curriculum actually teaches -- a missing addend at grade 3,
// a two-step solve with negatives at grade 7 -- while the shell, the rings and
// the pacing stay the same.

import { TAU, rand, clamp, roundRect, easeOutCubic } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

export class BossBeast extends Beast {
  // steps: [{ prompt, hint, answer }] -- one armour ring each.
  constructor(steps, x, y, speed) {
    super(x, y, speed);
    this.steps = steps;
    this.stage = 0;
    this.stages = steps.length;
    this.r = 78;
    this.w = this.r * 2;
    this.h = this.r * 2;
    this.hue = theme.boss;
    this.dieFor = 1.05;
    this.crack = steps.map(() => 0);
  }

  get isBoss() { return true; }
  get magnitude() {
    return Math.max(40, Math.abs(parseInt(this.steps[0].answer, 10) || 20) * 2.4);
  }

  get promptText() { return this.steps[Math.min(this.stage, this.stages - 1)].prompt; }
  get hintText() { return this.steps[Math.min(this.stage, this.stages - 1)].hint; }
  get answerText() { return this.steps[Math.min(this.stage, this.stages - 1)].answer; }

  accepts(raw) {
    const norm = (s) => String(s).trim().replace(/^−/, '-');
    return norm(raw) === norm(this.answerText);
  }

  // Only the last step kills it; earlier ones crack a ring and continue.
  resolve() {
    this.crack[this.stage] = 1;
    this.stage++;
    if (this.stage >= this.stages) { this.kill(); return true; }
    this.hitFlash = 0.6;
    return false;
  }

  update(dt) {
    super.update(dt);
    for (let i = 0; i < this.crack.length; i++) {
      if (this.crack[i] > 0 && this.crack[i] < 1.999) this.crack[i] += dt * 1.6;
    }
  }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    particles.burst(this.x, this.y, 120, {
      hue: 320, speed: 620, life: 1.5, size: 6, grav: 180, stretch: 1.2,
      glyphs: [...this.steps[this.stages - 1].answer.split(''), 'x', '='],
    });
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    ctx.save();
    if (dying) {
      const s = 1 + easeOutCubic(dieP) * 0.5;
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
      ctx.globalAlpha = 1 - easeOutCubic(dieP);
    }

    this.drawShell(ctx, isTarget && !dying, this.r * 1.25);

    ctx.save();
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 0.62);
    g.addColorStop(0, `hsla(${this.hue}, 90%, ${34 + this.hitFlash * 40}%, 0.98)`);
    g.addColorStop(1, `hsla(${this.hue}, 90%, 10%, 0.98)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.62, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.stages; i++) {
      const broken = this.crack[i] > 0;
      const shatter = clamp(this.crack[i], 0, 1);
      const rr = this.r * (0.72 + i * 0.14);
      const segs = 10 + i * 2;
      const alpha = broken ? Math.max(0, 1 - shatter) * 0.7 : 0.62;
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `hsla(${this.hue + i * 14}, 100%, ${64 + this.hitFlash * 25}%, ${alpha})`;
      ctx.lineWidth = 5 - i * 0.8;
      const groups = broken ? 3 : 1;
      for (let gi = 0; gi < groups; gi++) {
        const push = broken ? shatter * 46 * (1 + gi * 0.4) : 0;
        const rad = rr + push;
        ctx.beginPath();
        for (let s = gi; s < segs; s += groups) {
          const a0 = (s / segs) * TAU + this.t * (0.22 + i * 0.1) * (i % 2 ? -1 : 1);
          // Move to the arc's own start point, or arc() draws a joining line
          // from wherever the path currently is.
          ctx.moveTo(this.x + Math.cos(a0) * rad, this.y + Math.sin(a0) * rad);
          ctx.arc(this.x, this.y, rad, a0, a0 + (TAU / segs) * 0.72);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.save();
    for (let i = 0; i < this.stages; i++) {
      const done = i < this.stage;
      ctx.globalCompositeOperation = done ? 'lighter' : 'source-over';
      ctx.fillStyle = done ? 'hsla(48,100%,66%,0.95)' : 'rgba(120,110,150,0.35)';
      const spread = (this.stages - 1) * 9;
      roundRect(ctx, this.x - spread + i * 18, this.y + this.r * 0.72, 12, 5, 2.5);
      ctx.fill();
    }
    ctx.restore();

    if (!dying) this.drawLabel(ctx, this.promptText, 30);
    ctx.restore();
  }
}

// --- per-tier equations ----------------------------------------------------

const neg = (n) => (n < 0 ? `(−${Math.abs(n)})` : String(n));
const show = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));

export function bossSteps(kind, wave) {
  const ri = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

  if (kind === 'missing') {
    // Grade 3: a missing addend, undone and then checked.
    const b = ri(3, clamp(6 + wave, 6, 20));
    const x = ri(4, clamp(8 + wave * 2, 8, 40));
    const c = x + b;
    return [
      { prompt: `? + ${b} = ${c}`, hint: `take away: ${c} − ${b} =`, answer: String(x) },
      { prompt: `? = ${x}`, hint: `check: ${x} + ${b} =`, answer: String(c) },
    ];
  }

  if (kind === 'twostep') {
    // Grade 7: two steps, and often a negative coefficient or solution.
    const a = (Math.random() < 0.35 ? -1 : 1) * ri(2, clamp(3 + Math.floor(wave / 3), 3, 8));
    const x = (Math.random() < 0.3 ? -1 : 1) * ri(2, clamp(4 + Math.floor(wave / 3), 4, 11));
    const b = (Math.random() < 0.5 ? -1 : 1) * ri(2, clamp(6 + wave, 6, 18));
    const c = a * x + b;
    const ax = c - b;
    const undo = b < 0 ? `add ${Math.abs(b)}` : `subtract ${b}`;
    const sign = b < 0 ? `− ${Math.abs(b)}` : `+ ${b}`;
    return [
      {
        prompt: `${show(a)}x ${sign} = ${show(c)}`,
        hint: `${undo}: ${show(c)} ${b < 0 ? '+' : '−'} ${Math.abs(b)} =`,
        answer: show(ax),
      },
      {
        prompt: `${show(a)}x = ${show(ax)}`,
        hint: `divide by ${neg(a)}: ${show(ax)} ÷ ${neg(a)} =`,
        answer: show(x),
      },
      {
        prompt: `x = ${show(x)}`,
        hint: `check: ${neg(a)} × ${neg(x)} ${sign} =`,
        answer: show(c),
      },
    ];
  }

  // Medium: the one-step solve the game shipped with.
  const a = ri(2, clamp(2 + Math.floor(wave / 4), 2, 9));
  const x = ri(2, clamp(3 + Math.floor(wave / 3), 3, 12));
  const b = ri(1, clamp(5 + wave, 5, 20));
  const c = a * x + b;
  return [
    { prompt: `${a}x + ${b} = ${c}`, hint: `isolate: ${c} − ${b} =`, answer: String(c - b) },
    { prompt: `${a}x = ${c - b}`, hint: `solve: ${c - b} ÷ ${a} =`, answer: String(x) },
    { prompt: `x = ${x}`, hint: `verify: ${a} × ${x} + ${b} =`, answer: String(c) },
  ];
}
