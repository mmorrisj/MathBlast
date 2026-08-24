// The Codex page: one entry at a time, drawn full size.
//
// A grid of twenty-one thumbnails was the first instinct and it is the wrong
// one. These things are 100-190px across in the game and half of them are
// mostly text; shrunk into cards they become unreadable smudges, which defeats
// the point of drawing the real thing at all. One entry filling the page shows
// it at the size it actually appears, with room beside it for the working.
//
// The beast is drawn by its own draw() -- the same call the game makes -- so
// this page cannot drift out of sync with what a player will meet.

import { roundRect, clamp, TAU } from '../util.js';
import { theme } from '../theme.js';
import { ENTRIES } from '../codex.js';
import { levelName, levelCount } from '../curriculum.js';

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

// Where the example sits, and how wide the reading column is.
const ART_X = 336;
const ART_Y = 318;
const TEXT_X = 640;
const TEXT_W = 560;

export function codexCount() { return ENTRIES.length; }

// Bosses are drawn several times life size in game because the camera pulls
// back for them; the page has to bring them down to fit. One shared number
// does not work -- the Bulwark is a 900px wall and the Prism a 300px crystal,
// so a scale that fits the wall leaves the crystal a thumbnail. Each names its
// own. Beasts are uniform enough to derive theirs.
function artScale(entry, thing) {
  if (entry.kind === 'boss') return entry.scale || 0.5;
  const big = Math.max(thing.w || 120, thing.h || 120);
  return clamp(300 / big, 0.7, 2.1);
}

export function drawCodex(ctx, g, W, H, t) {
  const i = clamp(g.codexIndex || 0, 0, ENTRIES.length - 1);
  const entry = ENTRIES[i];
  const shown = g.codexShown;              // { thing, steps }, held by main

  ctx.save();
  // Opaque, not 96%. The scene behind this is a lit dome and a starfield on
  // near-black, and four percent of bright-on-dark is still legible -- the
  // shield plates and the title's key hints read straight through a 0.96
  // scrim as ghosts under the text.
  ctx.fillStyle = '#04060f';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  // --- header -------------------------------------------------------------
  ctx.textAlign = 'center';
  ctx.font = `700 34px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = `hsla(${theme.friendly},100%,60%,0.85)`;
  ctx.shadowBlur = 26;
  ctx.fillText('THE CODEX', W / 2, 46);
  ctx.shadowBlur = 0;
  ctx.font = `400 12px ${MONO}`;
  ctx.fillStyle = 'rgba(150,190,220,0.5)';
  ctx.fillText(`${i + 1} of ${ENTRIES.length}`, W / 2, 72);

  if (!shown) { ctx.restore(); return; }

  // --- the example, drawn by its own code ---------------------------------
  const thing = shown.thing;
  const s = artScale(entry, thing);
  ctx.save();
  // A plate behind it, so a dark beast on a dark page still has an edge.
  ctx.fillStyle = 'rgba(10,16,32,0.72)';
  roundRect(ctx, 60, 132, 552, 402, 16);
  ctx.fill();
  ctx.strokeStyle = `hsla(${theme.friendly},70%,60%,0.22)`;
  ctx.lineWidth = 1.4;
  roundRect(ctx, 60, 132, 552, 402, 16);
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(60, 132, 552, 402);
  ctx.clip();
  ctx.translate(ART_X, ART_Y);
  ctx.scale(s, s);
  try {
    if (entry.kind === 'boss') {
      // Encounters draw around their own x/y rather than the origin, and their
      // demands are separate beasts the game normally draws -- so the page has
      // to draw them too, or the Kraken has tentacles reaching to nothing.
      thing.x = 0; thing.y = 0;
      thing._drawBody(ctx);
      for (const held of thing.held || []) {
        if (held.draw) held.draw(ctx, false);
      }
    } else {
      thing.x = 0; thing.y = 0;
      thing.draw(ctx, false);
    }
  } catch { /* a half-built example must not take the page down */ }
  ctx.restore();

  // Only the answer. The beast draws its own question as part of draw() --
  // repeating it here printed the prompt twice, once from each source, and the
  // two collided at the bottom of the plate.
  if (entry.kind !== 'boss' && thing.answerText) {
    ctx.textAlign = 'center';
    ctx.font = `600 17px ${MONO}`;
    ctx.fillStyle = 'rgba(170,212,240,0.8)';
    ctx.fillText(`answer:  ${thing.answerText}`, ART_X, 560);
  }

  // --- the reading column -------------------------------------------------
  ctx.textAlign = 'left';
  let y = 150;

  ctx.font = `700 30px ${MONO}`;
  ctx.fillStyle = '#fff6dc';
  ctx.fillText(entry.name, TEXT_X, y);
  y += 26;

  ctx.font = `400 12px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,70%,0.75)`;
  ctx.fillText(entry.where.toUpperCase(), TEXT_X, y);
  y += 30;

  y = paragraph(ctx, entry.what, TEXT_X, y, TEXT_W, 15, 'rgba(206,230,248,0.9)');
  y += 16;

  // How to solve it, worked on the example actually on screen.
  ctx.font = `700 12px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,66%,0.7)`;
  ctx.fillText(entry.kind === 'boss' ? 'HOW THE FIGHT WORKS' : 'HOW TO SOLVE IT', TEXT_X, y);
  y += 22;
  for (const step of shown.steps) {
    ctx.fillStyle = 'rgba(255,226,150,0.75)';
    ctx.font = `700 14px ${MONO}`;
    ctx.fillText('›', TEXT_X, y + 1);
    y = paragraph(ctx, step, TEXT_X + 20, y, TEXT_W - 20, 14.5, 'rgba(220,238,252,0.92)');
    y += 8;
  }
  y += 10;

  // The trick, boxed, because it is what people came for.
  if (entry.trick) {
    const h = measure(ctx, entry.trick, TEXT_W - 32, 14.5) + 44;
    ctx.fillStyle = 'rgba(38,30,10,0.6)';
    roundRect(ctx, TEXT_X - 12, y - 16, TEXT_W + 12, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'hsla(46,100%,64%,0.35)';
    ctx.lineWidth = 1.4;
    roundRect(ctx, TEXT_X - 12, y - 16, TEXT_W + 12, h, 12);
    ctx.stroke();
    ctx.font = `700 12px ${MONO}`;
    ctx.fillStyle = 'hsla(46,100%,72%,0.9)';
    ctx.fillText('THE TRICK', TEXT_X + 4, y);
    y += 22;
    y = paragraph(ctx, entry.trick, TEXT_X + 4, y, TEXT_W - 24, 14.5, '#ffeec2');
  }

  // How this player is actually doing on it, if the ledger knows. A reference
  // page that also says "you are at 62% on this" stops being a manual and
  // starts being a map of your own progress.
  const rows = g.progress && entry.concept ? g.progress.summary() : null;
  const row = rows ? rows.find((r) => r.id === entry.concept) : null;
  if (row && row.seen > 0) {
    ctx.font = `400 13px ${MONO}`;
    ctx.fillStyle = 'rgba(150,200,235,0.62)';
    const lv = levelCount(entry.concept) > 1
      ? ` · reached ${levelName(entry.concept, row.top || 0)}` : '';
    ctx.fillText(`you: ${row.accuracy}% of ${row.seen} answered${lv}`, TEXT_X, H - 92);
  } else if (entry.concept) {
    ctx.font = `400 13px ${MONO}`;
    ctx.fillStyle = 'rgba(150,200,235,0.35)';
    ctx.fillText('you have not met this one yet', TEXT_X, H - 92);
  }

  // --- index strip and controls -------------------------------------------
  const stripY = H - 56;
  const gap = Math.min(26, (W - 200) / ENTRIES.length);
  const x0 = W / 2 - ((ENTRIES.length - 1) * gap) / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < ENTRIES.length; k++) {
    const on = k === i;
    const boss = ENTRIES[k].kind === 'boss';
    ctx.fillStyle = on
      ? `hsla(48,100%,72%,${0.85 + Math.sin(t * 6) * 0.15})`
      : `hsla(${boss ? theme.boss : theme.friendly},80%,64%,0.3)`;
    ctx.beginPath();
    // Bosses are squares in the strip, so the ten encounters are findable.
    if (boss) ctx.rect(x0 + k * gap - 3.5, stripY - 3.5, 7, 7);
    else ctx.arc(x0 + k * gap, stripY, on ? 5 : 3.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = `400 12px ${MONO}`;
  ctx.fillStyle = 'rgba(150,190,220,0.55)';
  ctx.fillText(g.touch ? 'TAP A DOT TO JUMP  ·  TAP THE PICTURE FOR A NEW EXAMPLE  ·  ESC TO CLOSE'
                       : '◀ ▶ BROWSE   ·   R FOR A NEW EXAMPLE   ·   ESC TO CLOSE',
               W / 2, H - 24);
  ctx.restore();
}

// --- text helpers ----------------------------------------------------------

function wrap(ctx, text, w) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > w && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function paragraph(ctx, text, x, y, w, size, colour) {
  ctx.font = `400 ${size}px ${MONO}`;
  ctx.fillStyle = colour;
  const lines = wrap(ctx, text, w);
  for (const l of lines) { ctx.fillText(l, x, y); y += size + 6; }
  return y;
}

function measure(ctx, text, w, size) {
  ctx.font = `400 ${size}px ${MONO}`;
  return wrap(ctx, text, w).length * (size + 6);
}

// Which dot was tapped, or -1.
export function codexHitTest(px, py, W, H) {
  const stripY = H - 56;
  if (Math.abs(py - stripY) > 18) return -1;
  const gap = Math.min(26, (W - 200) / ENTRIES.length);
  const x0 = W / 2 - ((ENTRIES.length - 1) * gap) / 2;
  for (let k = 0; k < ENTRIES.length; k++) {
    if (Math.abs(px - (x0 + k * gap)) <= gap / 2) return k;
  }
  return -1;
}

// The example plate, for tap-to-reroll.
export function codexArtHit(px, py) {
  return px >= 60 && px <= 612 && py >= 132 && py <= 534;
}
