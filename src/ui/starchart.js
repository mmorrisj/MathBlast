// The star chart: the multiplication table drawn as a night sky.
//
// The game already collects everything this needs -- SkillTable has kept
// {ema, misses, seen} for every fact, per profile, since the adaptive
// difficulty went in -- and showed the player four items of it on the game-over
// screen. This is that data made into the thing you fly against.
//
// One star per fact. Unseen facts are barely there; practised ones brighten as
// they get faster and cleaner; a fact that is genuinely known flares. When a
// whole row is known the stars join into a constellation, so "I lit up the
// sevens" becomes a thing that visibly happened.

import { TAU, clamp, roundRect } from '../util.js';
import { theme } from '../theme.js';
import { mastery, MASTERED } from '../problems.js';

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const LO = 2;
const HI = 12;
const N = HI - LO + 1;          // 11 x 11
const PITCH = 40;
const GRID_W = N * PITCH;
const CX = 470;                 // grid centre; the right third carries the tally
const CY = 386;

const gridX = (i) => CX - GRID_W / 2 + i * PITCH + PITCH / 2;
const gridY = (j) => CY - GRID_W / 2 + j * PITCH + PITCH / 2;

// Rows and columns of the times table, as constellations.
function lines(skill) {
  const out = [];
  for (let i = 0; i < N; i++) {
    let row = true;
    let col = true;
    for (let j = 0; j < N; j++) {
      if (mastery(skill.facts.get(skill.key(LO + i, LO + j, '×'))) < MASTERED) row = false;
      if (mastery(skill.facts.get(skill.key(LO + j, LO + i, '×'))) < MASTERED) col = false;
    }
    if (row) out.push({ kind: 'row', i });
    if (col) out.push({ kind: 'col', i });
  }
  return out;
}

// The numbers whose table is complete, in either direction. `5` and `x5` are
// the same achievement to a player, so they count once.
export function tables(skill) {
  const seen = new Set();
  for (const c of lines(skill)) seen.add(LO + c.i);
  return [...seen].sort((a, b) => a - b);
}

export function chartStats(skill) {
  let known = 0;
  let practised = 0;
  const total = N * N;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const m = mastery(skill.facts.get(skill.key(LO + i, LO + j, '×')));
      if (m >= MASTERED) known++;
      else if (m > 0) practised++;
    }
  }
  return { known, practised, total, constellations: tables(skill).length };
}

// The fact closest to being known but not there yet -- what to aim at next.
function nextUp(skill) {
  let best = null;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const f = skill.facts.get(skill.key(LO + i, LO + j, '×'));
      const m = mastery(f);
      if (m >= MASTERED || !f || !f.seen) continue;
      if (!best || m > best.m) best = { m, a: LO + i, b: LO + j };
    }
  }
  return best;
}

function star(ctx, x, y, m, t, seen) {
  if (m <= 0) {
    // Unseen: present, but only just. The sky should look like it has somewhere
    // to go.
    ctx.fillStyle = seen ? 'rgba(150,190,220,0.30)' : 'rgba(130,170,210,0.13)';
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, TAU);
    ctx.fill();
    return;
  }
  const twinkle = 0.86 + Math.sin(t * 1.7 + x * 0.11 + y * 0.07) * 0.14;
  // Tight. The cells are 40px apart, so a generous glow makes neighbouring
  // stars merge into one slab and the chart stops reading as a sky.
  // Weight the low end up: linearly, a half-known fact is nearly
  // indistinguishable from one never seen, which loses the middle of the chart
  // -- exactly the part a player is working on.
  const b = Math.pow(m, 0.55);
  const r = (1.0 + b * 2.1) * twinkle;
  const hue = 190 + m * 26;
  const halo = r * (m >= MASTERED ? 3.2 : 2.4);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(x, y, 0, x, y, halo);
  glow.addColorStop(0, `hsla(${hue}, 100%, ${62 + b * 22}%, ${0.16 + b * 0.3})`);
  glow.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, halo, 0, TAU);
  ctx.fill();

  ctx.fillStyle = `hsla(${hue}, 100%, ${72 + b * 22}%, ${0.55 + b * 0.45})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();

  // A known fact gets the four-point flare that reads as "star" rather than
  // "dot", which is most of what separates the top of the chart from the middle.
  if (m >= MASTERED) {
    const s = r * 3.4 * twinkle;
    ctx.strokeStyle = `hsla(${hue}, 100%, 88%, 0.8)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStarChart(ctx, g, W, H, t) {
  const skill = g.skill;
  const stats = chartStats(skill);
  const cons = lines(skill);

  ctx.save();
  ctx.fillStyle = 'rgba(4,6,16,0.94)';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'center';
  ctx.font = `700 34px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = `hsla(${theme.friendly},100%,60%,0.85)`;
  ctx.shadowBlur = 26;
  ctx.fillText('YOUR SKY', CX, 74);
  ctx.shadowBlur = 0;

  const player = g.profiles.active;
  if (player) {
    ctx.font = `400 13px ${MONO}`;
    ctx.fillStyle = 'rgba(150,190,220,0.6)';
    ctx.fillText(player.name, CX, 100);
  }

  // Constellation lines go under the stars.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `hsla(${theme.friendly}, 95%, 66%, 0.34)`;
  ctx.lineWidth = 1.3;
  for (const c of cons) {
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const x = c.kind === 'row' ? gridX(k) : gridX(c.i);
      const y = c.kind === 'row' ? gridY(c.i) : gridY(k);
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const f = skill.facts.get(skill.key(LO + i, LO + j, '×'));
      star(ctx, gridX(j), gridY(i), mastery(f), t, Boolean(f && f.seen));
    }
  }

  // Axis labels. A row that has become a constellation is named in gold.
  ctx.font = `600 12px ${MONO}`;
  for (let i = 0; i < N; i++) {
    const rowDone = cons.some((c) => c.kind === 'row' && c.i === i);
    const colDone = cons.some((c) => c.kind === 'col' && c.i === i);
    ctx.textAlign = 'right';
    ctx.fillStyle = rowDone ? 'rgba(255,226,150,0.95)' : 'rgba(150,190,220,0.5)';
    ctx.fillText(String(LO + i), CX - GRID_W / 2 - 10, gridY(i));
    ctx.textAlign = 'center';
    ctx.fillStyle = colDone ? 'rgba(255,226,150,0.95)' : 'rgba(150,190,220,0.5)';
    ctx.fillText(String(LO + i), gridX(i), CY - GRID_W / 2 - 14);
  }

  // The tally.
  const px = 900;
  ctx.textAlign = 'left';
  ctx.font = `700 13px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,66%,0.85)`;
  ctx.fillText('TIMES TABLES', px, 170);

  const pct = Math.round((stats.known / stats.total) * 100);
  ctx.font = `700 58px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.fillText(`${pct}%`, px, 216);
  ctx.font = `400 14px ${MONO}`;
  ctx.fillStyle = 'rgba(180,214,240,0.75)';
  ctx.fillText(`${stats.known} of ${stats.total} stars lit`, px, 252);
  ctx.fillStyle = 'rgba(150,190,220,0.55)';
  ctx.fillText(`${stats.practised} still warming up`, px, 274);

  // Progress bar.
  const bw = 250;
  ctx.fillStyle = 'rgba(120,170,215,0.16)';
  roundRect(ctx, px, 296, bw, 8, 4);
  ctx.fill();
  if (stats.known) {
    ctx.fillStyle = `hsla(${theme.friendly},95%,62%,0.9)`;
    roundRect(ctx, px, 296, Math.max(6, bw * (stats.known / stats.total)), 8, 4);
    ctx.fill();
  }

  ctx.font = `700 13px ${MONO}`;
  ctx.fillStyle = 'rgba(255,226,150,0.85)';
  ctx.fillText('CONSTELLATIONS', px, 348);
  ctx.font = `400 14px ${MONO}`;
  ctx.fillStyle = 'rgba(180,214,240,0.75)';
  const done = tables(skill);
  ctx.fillText(done.length
    ? done.map((n) => `${n}s`).join('   ')
    : 'none yet — light a whole row', px, 374);

  const next = nextUp(skill);
  ctx.font = `700 13px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,66%,0.85)`;
  ctx.fillText('CLOSEST TO LIT', px, 420);
  ctx.font = `700 26px ${MONO}`;
  ctx.fillStyle = '#fff0d0';
  ctx.fillText(next ? `${next.a} × ${next.b}` : '—', px, 452);

  ctx.textAlign = 'center';
  ctx.font = `400 13px ${MONO}`;
  ctx.fillStyle = 'rgba(150,190,220,0.5)';
  ctx.fillText('a star lights when you answer it quickly and cleanly, a few times over',
               W / 2, H - 82);
  ctx.font = `600 15px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,72%,0.9)`;
  ctx.fillText(g.touch ? 'tap anywhere to go back' : 'S or ESC to go back', W / 2, H - 50);
  ctx.restore();
}
