// Grade-3 addition and subtraction, drawn as base-ten blocks.
//
// A tens rod is ten stacked units and a one is a single square, which is how
// the material is actually taught — so a stuck player can count the blocks the
// same way they would count a 7x8 lattice. Subtraction strikes out the part
// being taken away rather than showing a second pile, because that is what
// subtraction looks like.

import { TAU, rand, clamp, roundRect, addRoundRect, easeOutCubic, toInt } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from './base.js';

const UNIT = 7;          // one block
const GAP = 2;
const ROD_H = UNIT * 10 + GAP * 9;
const COL_GAP = 6;

// Width of a base-ten group: tens rods in a row, then ones stacked five high.
function groupSize(n) {
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const oneCols = Math.ceil(ones / 5);
  const cols = tens + oneCols;
  return {
    tens, ones, oneCols,
    w: Math.max(UNIT, cols * (UNIT + COL_GAP) - COL_GAP),
    h: ROD_H,
  };
}

function drawGroup(ctx, x, y, n, hue, struck = 0) {
  const { tens, ones, oneCols } = groupSize(n);
  let cx = x;
  let drawn = 0;
  const cell = (px, py, i) => {
    const gone = i < struck;
    ctx.fillStyle = gone
      ? 'rgba(120,130,150,0.22)'
      : `hsla(${hue}, 100%, ${58 + ((i * 37) % 5) * 4}%, 0.92)`;
    ctx.beginPath();
    addRoundRect(ctx, px, py, UNIT, UNIT, 1.6);
    ctx.fill();
    if (gone) {
      ctx.strokeStyle = 'rgba(255,120,110,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, py + UNIT);
      ctx.lineTo(px + UNIT, py);
      ctx.stroke();
    }
  };

  for (let t = 0; t < tens; t++) {
    for (let i = 0; i < 10; i++) cell(cx, y + i * (UNIT + GAP), drawn++);
    // A hairline around the rod so ten reads as one object, not ten.
    ctx.strokeStyle = `hsla(${hue}, 80%, 70%, 0.4)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 1.5, y - 1.5, UNIT + 3, ROD_H + 3);
    cx += UNIT + COL_GAP;
  }
  for (let c = 0; c < oneCols; c++) {
    const inCol = Math.min(5, ones - c * 5);
    for (let i = 0; i < inCol; i++) {
      cell(cx, y + ROD_H - (i + 1) * (UNIT + GAP) + GAP, drawn++);
    }
    cx += UNIT + COL_GAP;
  }
}

export class ArithBeast extends Beast {
  // op is '+' or '-'.
  constructor(a, b, op, x, y, speed) {
    super(x, y, speed);
    this.a = a; this.b = b; this.op = op;
    this.value = op === '+' ? a + b : a - b;
    this.hue = theme.hostile + (op === '+' ? 10 : -4);
    this.dieFor = 0.5;

    const ga = groupSize(a);
    const gb = groupSize(b);
    this.ga = ga; this.gb = gb;
    this.opW = 26;
    this.w = op === '+' ? ga.w + this.opW + gb.w + 24 : ga.w + 24;
    this.h = ROD_H + 22;
  }

  get magnitude() { return Math.max(6, Math.abs(this.value) * 1.6); }
  get promptText() { return `${this.a} ${this.op === '+' ? '+' : '−'} ${this.b}`; }
  get factOp() { return this.op === '+' ? '+' : '−'; }
  get hintText() { return `${this.promptText} =`; }
  get answerText() { return String(this.value); }
  accepts(raw) { return toInt(raw) === this.value; }

  emitCollapse(particles, prevT) {
    if (this.state !== 'dying' || prevT > 0) return;
    particles.burst(this.x, this.y, 34, {
      hue: 44, speed: 300, life: 0.8, size: 3.6, grav: 170, stretch: 0.9,
      glyphs: this.answerText.split(''),
    });
  }

  draw(ctx, isTarget) {
    const dying = this.state === 'dying';
    const dieP = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    const x0 = this.x - this.w / 2;
    const y0 = this.y - this.h / 2;

    ctx.save();
    if (dying) {
      const s = 1 + easeOutCubic(dieP) * 0.18;
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
      ctx.globalAlpha = 1 - easeOutCubic(dieP) * 0.9;
    }

    this.drawShell(ctx, isTarget && !dying, Math.max(this.w, this.h) * 0.62);

    ctx.save();
    roundRect(ctx, x0, y0, this.w, this.h, 10);
    ctx.fillStyle = `hsla(${this.hue}, 45%, 9%, 0.86)`;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `hsla(${this.hue}, 80%, 55%, ${this.hitFlash > 0 ? 1 : 0.5})`;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const blockY = y0 + 11;
    if (this.op === '+') {
      drawGroup(ctx, x0 + 12, blockY, this.a, this.hue);
      drawGroup(ctx, x0 + 12 + this.ga.w + this.opW, blockY, this.b, this.hue + 18);
      ctx.restore();
      // The operator, between the two piles.
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 24px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = '#ffe6c8';
      ctx.fillText('+', x0 + 12 + this.ga.w + this.opW / 2, this.y);
      ctx.restore();
    } else {
      // Subtraction strikes out what is being taken away.
      drawGroup(ctx, x0 + 12, blockY, this.a, this.hue, this.b);
      ctx.restore();
    }

    if (!dying) this.drawLabel(ctx, this.promptText, 26);
    ctx.restore();
  }
}

// Operands come from the tier: Easy is strictly single digit, Medium two. The
// cap used to be `20 + wave * 6` for every tier, so Easy opened on two-digit
// sums like 23 + 19 on its very first wave. Differences never go negative.
export function makeArith(op, wave, range, cap) {
  const lo = range.lo;
  const hi = Math.max(lo + 1, cap);
  if (op === '+') {
    const a = lo + Math.floor(Math.random() * (hi - lo + 1));
    const b = lo + Math.floor(Math.random() * (hi - lo + 1));
    return { a, b, op: '+' };
  }
  // Subtraction reads off the same pile, so the minuend has to be the larger.
  const a = Math.max(lo + 1, lo + Math.floor(Math.random() * (hi - lo + 1)));
  const b = 1 + Math.floor(Math.random() * (a - 1));
  return { a, b, op: '-' };
}
