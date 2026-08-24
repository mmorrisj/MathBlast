// HUD and overlays. The readouts are drawn into the scene before post so they
// pick up bloom; the title, interlude and game-over screens go on top of it so
// they stay crisp and full colour.

import { clamp, lerp, easeOutElastic, easeOutCubic, roundRect, TAU, showSigned } from '../util.js';
import { theme, bandNameFor } from '../theme.js';
import { drawScores } from './profile.js';
import { TIERS } from '../difficulty.js';
import { planLabel } from '../adaptive.js';

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

let ENTRY_Y = 674;
const CHOICE_GAP = 14;

// Touch gets bigger boxes: at 58px tall in canvas space these fall under the
// ~44px physical minimum once 1280x720 is scaled down to a phone screen.
let choiceW = 132;
let choiceH = 58;
export function setChoiceLayout(touch) {
  choiceW = touch ? 168 : 132;
  choiceH = touch ? 84 : 58;
  ENTRY_Y = touch ? 644 : 674;
}

function choiceRect(i, count) {
  const total = count * choiceW + (count - 1) * CHOICE_GAP;
  const x0 = 640 - total / 2;
  return { x: x0 + i * (choiceW + CHOICE_GAP), y: ENTRY_Y - choiceH / 2, w: choiceW, h: choiceH };
}

export function choiceHitTest(px, py, choices) {
  for (let i = 0; i < choices.length; i++) {
    const r = choiceRect(i, choices.length);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
  }
  return -1;
}

const TIER_W = 176;
const TIER_H = 46;
const TIER_GAP = 12;
const TIER_Y = 470;

// On a touchscreen the title screen used to read "H HOW TO PLAY  T TOP 20
// S YOUR SKY  G PROGRESS" -- nine keys that do not exist on a phone. These are
// the same destinations as buttons.
export const TITLE_CHIPS = [
  { id: 'help', label: 'HOW TO PLAY' },
  { id: 'board', label: 'TOP 20' },
  { id: 'sky', label: 'YOUR SKY' },
  { id: 'report', label: 'PROGRESS' },
];
const CHIP_W = 250;
const CHIP_H = 64;
const CHIP_GAP = 16;
const CHIP_Y = 618;

export function chipRect(i, W) {
  const total = TITLE_CHIPS.length * CHIP_W + (TITLE_CHIPS.length - 1) * CHIP_GAP;
  return { x: W / 2 - total / 2 + i * (CHIP_W + CHIP_GAP), y: CHIP_Y, w: CHIP_W, h: CHIP_H };
}

export function chipHitTest(px, py, W) {
  for (let i = 0; i < TITLE_CHIPS.length; i++) {
    const r = chipRect(i, W);
    // Generous: thumbs are imprecise and every one of these is harmless.
    if (px >= r.x - 6 && px <= r.x + r.w + 6 && py >= r.y - 8 && py <= r.y + r.h + 8) {
      return TITLE_CHIPS[i].id;
    }
  }
  return null;
}

export function tierRect(i, W) {
  const total = TIERS.length * TIER_W + (TIERS.length - 1) * TIER_GAP;
  return { x: W / 2 - total / 2 + i * (TIER_W + TIER_GAP), y: TIER_Y, w: TIER_W, h: TIER_H };
}

export function tierHitTest(px, py, W) {
  for (let i = 0; i < TIERS.length; i++) {
    const r = tierRect(i, W);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
  }
  return -1;
}

let topScrim = null;
let bottomScrim = null;
let bottomScrimTop = -1;

// A fact just crossed into being known. It fades in, holds, and fades out.
function drawMastered(ctx, g, W, H) {
  const fx = g.masteredFx;
  if (!fx) return;
  const a = Math.min(1, fx.t / 0.2) * Math.min(1, (2.4 - fx.t) / 0.6);
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 12px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,70%,0.9)`;
  ctx.fillText('STAR LIT', W / 2, H - 196);
  ctx.font = `700 28px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = `hsla(${theme.friendly},100%,62%,0.95)`;
  ctx.shadowBlur = 24;
  ctx.fillText(fx.text, W / 2, H - 168);
  ctx.restore();
}

// Shown across the middle on the last core: the one moment the game raises its
// voice. Everything else in the danger ramp is continuous.
function drawLastStand(ctx, g, W, H, t) {
  const k = g.lastStandT;
  if (k < 0.02) return;
  ctx.save();
  ctx.globalAlpha = k;
  const pulse = 0.6 + Math.sin(t * 5) * 0.4;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 30px ${MONO}`;
  ctx.fillStyle = `rgba(255,138,110,${0.5 + pulse * 0.5})`;
  ctx.shadowColor = 'hsla(12,100%,58%,0.95)';
  ctx.shadowBlur = 26 * pulse;
  ctx.fillText('LAST CORE', W / 2, 150);
  ctx.shadowBlur = 0;
  ctx.font = `400 13px ${MONO}`;
  ctx.fillStyle = `rgba(255,190,170,${0.35 + pulse * 0.25})`;
  ctx.fillText('one more landing ends the run', W / 2, 176);
  ctx.restore();
}

export function drawHud(ctx, g, W, H) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Beasts descend straight through the top row. A scrim keeps it legible.
  if (!topScrim) {
    topScrim = ctx.createLinearGradient(0, 0, 0, 170);
    topScrim.addColorStop(0, 'rgba(4,7,18,0.72)');
    topScrim.addColorStop(0.6, 'rgba(4,7,18,0.34)');
    topScrim.addColorStop(1, 'rgba(4,7,18,0)');
  }
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, W, 170);

  ctx.textAlign = 'left';
  ctx.font = `700 15px ${MONO}`;
  ctx.fillStyle = 'rgba(150,200,235,0.6)';
  ctx.fillText('SCORE', 34, 46);
  ctx.font = `700 44px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = `hsla(${theme.friendly}, 100%, 70%, 0.7)`;
  ctx.shadowBlur = 16;
  ctx.fillText(String(g.score).padStart(6, '0'), 34, 88);
  ctx.shadowBlur = 0;

  const acc = g.attempts ? Math.round((g.solved / g.attempts) * 100) : 100;
  ctx.font = `500 14px ${MONO}`;
  ctx.fillStyle = 'rgba(150,200,235,0.5)';
  ctx.fillText(`ACCURACY ${acc}%   BEST ×${g.bestCombo}`, 34, 112);

  ctx.textAlign = 'center';
  ctx.font = `700 15px ${MONO}`;
  ctx.fillStyle = 'rgba(150,200,235,0.6)';
  ctx.fillText(`WAVE ${g.wave}`, W / 2, 46);
  // Wave announcement. Deliberately a slim band just under the HUD rather than
  // a centred slab: beasts occupy the middle of the screen and a big banner
  // there covers the very problem the player is trying to read.
  if (g.waveBanner > 0 && g.wavePhase === 'active') {
    const p = clamp(1 - g.waveBanner / 2.2, 0, 1);
    const a = Math.sin(p * Math.PI);
    const label = `WAVE ${g.wave}   ·   ${theme.bandName}`;
    ctx.font = `700 30px ${MONO}`;
    const tw = ctx.measureText(label).width;
    const spread = 120 + easeOutCubic(p) * 190;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,206,120,${a * 0.5})`;
    ctx.lineWidth = 1.4;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + dir * (tw / 2 + 22), 190);
      ctx.lineTo(W / 2 + dir * spread, 190);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = `rgba(255,236,180,${a})`;
    ctx.shadowColor = 'rgba(255,190,80,0.9)';
    ctx.shadowBlur = 24;
    ctx.fillText(label, W / 2, 200);
    ctx.shadowBlur = 0;
  }

  ctx.textAlign = 'right';
  ctx.font = `700 15px ${MONO}`;
  ctx.fillStyle = 'rgba(150,200,235,0.6)';
  ctx.fillText('CORES', W - 34, 46);
  for (let i = 0; i < 3; i++) {
    const x = W - 44 - i * 34;
    const on = i < g.cores;
    ctx.save();
    ctx.translate(x, 76);
    ctx.rotate(Math.PI / 4);
    ctx.globalCompositeOperation = on ? 'lighter' : 'source-over';
    ctx.fillStyle = on ? `hsla(${theme.friendly},100%,62%,0.9)` : 'rgba(90,110,140,0.28)';
    roundRect(ctx, -10, -10, 20, 20, 3);
    ctx.fill();
    ctx.restore();
  }

  // Combo ladder: five rungs, one per chord tone the audio is climbing.
  const rungs = 5;
  const step = g.combo > 0 ? (g.combo - 1) % rungs : -1;
  const oct = g.combo > 0 ? Math.min(Math.floor((g.combo - 1) / rungs), 2) : 0;
  ctx.textAlign = 'left';
  for (let i = 0; i < rungs; i++) {
    const y = 300 - i * 26;
    const lit = i <= step;
    ctx.save();
    ctx.globalCompositeOperation = lit ? 'lighter' : 'source-over';
    ctx.fillStyle = lit
      ? `hsla(${150 + oct * 28}, 100%, ${58 + i * 4}%, ${0.55 + 0.45 * (i === step ? 1 : 0.4)})`
      : 'rgba(90,110,140,0.2)';
    roundRect(ctx, 34, y, 16 + i * 7, 12, 3);
    ctx.fill();
    ctx.restore();
  }
  if (g.combo > 1) {
    ctx.font = `700 26px ${MONO}`;
    ctx.fillStyle = 'hsla(155,100%,70%,0.95)';
    ctx.shadowColor = 'hsla(155,100%,60%,0.8)';
    ctx.shadowBlur = 14;
    ctx.fillText(`×${g.combo}`, 34, 340);
    ctx.shadowBlur = 0;
  }

  // Overcharge. On touch the beam button already shows this, so skip it.
  const ready = g.overcharge >= 1;
  if (!g.touch) {
  ctx.font = `500 12px ${MONO}`;
  ctx.fillStyle = ready ? 'rgba(255,226,150,0.9)' : 'rgba(150,200,235,0.5)';
  ctx.fillText(ready ? 'OVERCHARGE — SPACE' : 'OVERCHARGE', 34, 386);
  ctx.fillStyle = 'rgba(20,34,56,0.8)';
  roundRect(ctx, 34, 394, 150, 8, 4);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = ready
    ? `hsla(48,100%,${66 + Math.sin(g.time * 12) * 20}%,0.95)`
    : `hsla(${theme.friendly + 20},100%,62%,0.8)`;
  roundRect(ctx, 34, 394, Math.max(2, 150 * clamp(g.overcharge, 0, 1)), 8, 4);
  ctx.fill();
  ctx.restore();
  }

  // Shield coverage.
  const cov = g.shield.coverage;
  const bw = 190, bx = W - 34 - bw, by = 116;
  ctx.textAlign = 'right';
  ctx.font = `500 12px ${MONO}`;
  ctx.fillStyle = 'rgba(150,200,235,0.55)';
  ctx.fillText(`SHIELD ${Math.round(cov * 100)}%`, W - 34, 106);
  ctx.fillStyle = 'rgba(20,34,56,0.75)';
  roundRect(ctx, bx, by, bw, 8, 4);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `hsla(${theme.friendly},100%,60%,0.85)`;
  roundRect(ctx, bx, by, Math.max(2, bw * cov), 8, 4);
  ctx.fill();
  ctx.restore();

  // Targeting mode readout: switching target is the least discoverable control
  // in the game, so it gets a permanent line rather than a tooltip.
  const manual = g.manualTargetId != null;
  const pick = g.touch ? 'tap a beast' : '[ ] or click';
  if (manual || !g.touch) {
    ctx.textAlign = 'center';
    ctx.font = `500 12px ${MONO}`;
    ctx.fillStyle = manual ? 'rgba(255,226,150,0.85)' : 'rgba(150,200,235,0.45)';
    ctx.fillText(
      manual ? `TARGET LOCKED — ${pick} to switch` : `AUTO-TARGET — ${pick} to choose`,
      W / 2, ENTRY_Y - (g.inputMode === 'choose' ? 84 : 44),
    );
  }

  // The answer row overlaps the dome once it lifts for touch. Same scrim
  // treatment as the top HUD, for the same reason.
  if (g.touch) {
    const top = ENTRY_Y - 108;
    if (!bottomScrim || bottomScrimTop !== top) {
      bottomScrim = ctx.createLinearGradient(0, top, 0, H);
      bottomScrim.addColorStop(0, 'rgba(4,7,18,0)');
      bottomScrim.addColorStop(0.35, 'rgba(4,7,18,0.58)');
      bottomScrim.addColorStop(1, 'rgba(4,7,18,0.9)');
      bottomScrimTop = top;
    }
    ctx.fillStyle = bottomScrim;
    ctx.fillRect(0, top, W, H - top);
  }

  drawEntry(ctx, g, W, H);
  drawLastStand(ctx, g, W, H, g.time);
  drawMastered(ctx, g, W, H);
  ctx.restore();
}

// The answer row. Typing shows a box that squashes on each keystroke; pointer,
// touch and gamepad get four orbs to pick from instead.
function drawEntry(ctx, g, W, H) {
  const target = g.targetBeast;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (g.inputMode === 'choose') {
    if (target) {
      const hy = ENTRY_Y - choiceH / 2 - 26;
      ctx.font = `500 20px ${MONO}`;
      if (g.touch) {
        // A pill keeps the question legible over the shield plates behind it.
        const tw = ctx.measureText(target.hintText).width;
        ctx.fillStyle = 'rgba(6,12,26,0.88)';
        roundRect(ctx, W / 2 - tw / 2 - 18, hy - 18, tw + 36, 36, 10);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(178,216,246,0.92)';
      ctx.fillText(target.hintText, W / 2, hy);
    }
    for (let i = 0; i < g.choices.length; i++) {
      const r = choiceRect(i, g.choices.length);
      const sel = i === g.choiceIndex;
      ctx.save();
      ctx.fillStyle = 'rgba(10,20,38,0.82)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fill();
      ctx.lineWidth = sel ? 2.6 : 1.4;
      ctx.strokeStyle = sel
        ? `hsla(48,100%,70%,${0.85 + Math.sin(g.time * 7) * 0.15})`
        : `hsla(${theme.friendly},70%,60%,0.4)`;
      ctx.stroke();
      if (sel) {
        ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0,
                                            r.x + r.w / 2, r.y + r.h / 2, r.w * 0.7);
        gg.addColorStop(0, 'hsla(48,100%,64%,0.22)');
        gg.addColorStop(1, 'hsla(48,100%,60%,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(r.x - 20, r.y - 20, r.w + 40, r.h + 40);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.font = `700 ${choiceH > 70 ? 36 : 30}px ${MONO}`;
      ctx.fillStyle = sel ? '#fff6dc' : 'rgba(220,238,252,0.85)';
      ctx.fillText(showSigned(g.choices[i]), r.x + r.w / 2, r.y + r.h / 2 + 1);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  const pulse = g.inputPulse > 0 ? easeOutElastic(1 - g.inputPulse) : 1;
  const scale = lerp(1.32, 1, clamp(pulse, 0, 1));

  if (target) {
    ctx.font = `500 21px ${MONO}`;
    ctx.fillStyle = 'rgba(160,205,240,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText(target.hintText, W / 2 - 62, ENTRY_Y);
    ctx.textAlign = 'center';
  }

  ctx.translate(W / 2 + 60, ENTRY_Y);
  ctx.scale(scale, scale);
  const boxW = 176, boxH = 56;
  ctx.fillStyle = 'rgba(10,20,38,0.8)';
  roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 10);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = g.input
    ? 'hsla(155,100%,62%,0.9)'
    : `hsla(${theme.friendly},80%,60%,${0.35 + Math.sin(g.time * 4) * 0.15})`;
  ctx.stroke();

  if (g.input) {
    ctx.font = `700 ${g.input.length > 3 ? 30 : 40}px ${MONO}`;
    ctx.fillStyle = '#f2fffa';
    ctx.shadowColor = 'hsla(155,100%,60%,0.9)';
    ctx.shadowBlur = 18;
    ctx.fillText(g.input, 0, 2);
  } else {
    ctx.font = `500 14px ${MONO}`;
    ctx.fillStyle = 'rgba(150,200,235,0.4)';
    ctx.fillText('TYPE ANSWER', 0, 2);
  }
  ctx.restore();
}

// Redrawn above the post chain during slow motion. The scene behind is
// desaturated; this puts the one thing that matters back in full colour.
export function drawFocus(ctx, g, W, H, amount, camera) {
  const t = g.targetBeast;
  if (amount < 0.02) return;
  ctx.save();
  ctx.globalAlpha = clamp(amount, 0, 1);
  if (t) {
    ctx.save();
    camera.apply(ctx, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = `700 30px ${MONO}`;
    ctx.shadowColor = 'hsla(30, 100%, 60%, 0.95)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#fff5d6';
    ctx.fillText(t.promptText, t.x, t.y - t.h / 2 - 14);
    ctx.restore();
  }
  // Targeting mode readout: switching target is the least discoverable control
  // in the game, so it gets a permanent line rather than a tooltip.
  const manual = g.manualTargetId != null;
  const pick = g.touch ? 'tap a beast' : '[ ] or click';
  if (manual || !g.touch) {
    ctx.textAlign = 'center';
    ctx.font = `500 12px ${MONO}`;
    ctx.fillStyle = manual ? 'rgba(255,226,150,0.85)' : 'rgba(150,200,235,0.45)';
    ctx.fillText(
      manual ? `TARGET LOCKED — ${pick} to switch` : `AUTO-TARGET — ${pick} to choose`,
      W / 2, ENTRY_Y - (g.inputMode === 'choose' ? 84 : 44),
    );
  }

  // The answer row overlaps the dome once it lifts for touch. Same scrim
  // treatment as the top HUD, for the same reason.
  if (g.touch) {
    const top = ENTRY_Y - 108;
    if (!bottomScrim || bottomScrimTop !== top) {
      bottomScrim = ctx.createLinearGradient(0, top, 0, H);
      bottomScrim.addColorStop(0, 'rgba(4,7,18,0)');
      bottomScrim.addColorStop(0.35, 'rgba(4,7,18,0.58)');
      bottomScrim.addColorStop(1, 'rgba(4,7,18,0.9)');
      bottomScrimTop = top;
    }
    ctx.fillStyle = bottomScrim;
    ctx.fillRect(0, top, W, H - top);
  }

  drawEntry(ctx, g, W, H);
  ctx.restore();
}

// The beat between waves: everything holds, and a clean wave gets its moment.
export function drawInterlude(ctx, g, W, H, p) {
  const fade = Math.sin(clamp(p, 0, 1) * Math.PI);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `700 44px ${MONO}`;
  ctx.fillStyle = '#dff1ff';
  ctx.shadowColor = `hsla(${theme.friendly},100%,62%,0.9)`;
  ctx.shadowBlur = 26;
  ctx.fillText(`WAVE ${g.wave} CLEAR`, W / 2, H / 2 - 66);

  // Entering a new sector. The bands have been named since they went in and
  // the name was never once shown.
  // Ask whether the name actually changes rather than doing the modulo: past
  // the last band every third wave would otherwise re-announce CRIMSON DEEP.
  if (g.wave >= 1 && bandNameFor(g.wave + 1) !== bandNameFor(g.wave)) {
    ctx.font = `700 12px ${MONO}`;
    ctx.fillStyle = `hsla(${theme.friendly},90%,70%,0.8)`;
    ctx.shadowBlur = 0;
    ctx.fillText('ENTERING', W / 2, H / 2 - 18);
    ctx.font = `700 40px ${MONO}`;
    ctx.fillStyle = '#dff1ff';
    ctx.shadowColor = `hsla(${theme.env},100%,64%,0.95)`;
    ctx.shadowBlur = 34;
    ctx.fillText(bandNameFor(g.wave + 1), W / 2, H / 2 + 20);
    ctx.shadowBlur = 0;
  } else if (g.lastPerfect) {
    const s = 1 + Math.sin(p * Math.PI) * 0.06;
    ctx.save();
    ctx.translate(W / 2, H / 2 - 6);
    ctx.scale(s, s);
    ctx.font = `700 62px ${MONO}`;
    ctx.fillStyle = '#fff0c4';
    ctx.shadowColor = 'hsla(46,100%,60%,0.95)';
    ctx.shadowBlur = 40;
    ctx.fillText('PERFECT', 0, 0);
    ctx.restore();
    ctx.font = `500 17px ${MONO}`;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(200,230,250,0.8)';
    ctx.fillText('no misses — one plate repaired', W / 2, H / 2 + 44);
  }
  ctx.restore();
}

export function drawTitle(ctx, W, H, t, g) {
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,16,0.74)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const bob = Math.sin(t * 1.6) * 6;
  ctx.font = `700 104px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = `hsla(${theme.friendly},100%,60%,0.9)`;
  ctx.shadowBlur = 44;
  ctx.fillText('MATHBLAST', W / 2, 118 + bob);
  ctx.shadowBlur = 0;

  const player = g && g.profiles.active;
  if (player) {
    ctx.font = `600 19px ${MONO}`;
    ctx.fillStyle = `hsla(${theme.friendly},90%,74%,0.95)`;
    ctx.fillText(player.name, W / 2, 206);
    ctx.font = `400 13px ${MONO}`;
    ctx.fillStyle = 'rgba(150,190,220,0.6)';
    ctx.fillText(player.games ? `your best ${player.bestScore} · wave ${player.bestWave}`
                              : 'first run — good luck',
                 W / 2, 226);
  }

  // Difficulty. Each tier is a different curriculum, so it is chosen before the
  // run rather than buried in an options screen.
  if (g) {
    ctx.font = `700 12px ${MONO}`;
    ctx.fillStyle = `hsla(${theme.friendly},90%,66%,0.75)`;
    ctx.fillText('DIFFICULTY   ◀ ▶', W / 2, TIER_Y - 18);
    for (let i = 0; i < TIERS.length; i++) {
      const r = tierRect(i, W);
      const on = i === g.tierIndex;
      ctx.fillStyle = on ? 'rgba(18,38,62,0.92)' : 'rgba(10,18,34,0.6)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      ctx.lineWidth = on ? 2.4 : 1.2;
      ctx.strokeStyle = on
        ? `hsla(48,100%,70%,${0.85 + Math.sin(t * 7) * 0.15})`
        : `hsla(${theme.friendly},70%,60%,0.28)`;
      ctx.stroke();
      ctx.font = `700 17px ${MONO}`;
      ctx.fillStyle = on ? '#fff6dc' : 'rgba(180,214,240,0.7)';
      ctx.fillText(TIERS[i].name, r.x + r.w / 2, r.y + 19);
      ctx.font = `400 12px ${MONO}`;
      ctx.fillStyle = on ? 'rgba(255,236,190,0.8)' : 'rgba(150,190,220,0.5)';
      ctx.fillText(TIERS[i].grade, r.x + r.w / 2, r.y + 35);
    }
    ctx.font = `400 14px ${MONO}`;
    ctx.fillStyle = 'rgba(170,210,240,0.75)';
    const sel = TIERS[g.tierIndex];
    // Dynamic states its current ratio instead of a blurb. Adaptive difficulty
    // that will not say what it is doing is just an unexplained spike.
    ctx.fillText(sel.dynamic ? planLabel(g.plan) : sel.blurb, W / 2, TIER_Y + TIER_H + 24);
  }

  const touch = Boolean(g && g.touch);
  const a = 0.55 + Math.sin(t * 4) * 0.45;
  ctx.font = `700 24px ${MONO}`;
  ctx.fillStyle = `rgba(255,232,170,${a})`;
  // Any tap that is not a chip or a tier starts the run, so do not name one
  // particular thing to tap.
  ctx.fillText(touch ? 'TAP TO BEGIN' : 'PRESS ENTER TO BEGIN',
               W / 2, TIER_Y + TIER_H + 62);

  if (touch) {
    for (let i = 0; i < TITLE_CHIPS.length; i++) {
      const r = chipRect(i, W);
      ctx.fillStyle = 'rgba(10,18,34,0.78)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `hsla(${theme.friendly},80%,62%,0.42)`;
      ctx.stroke();
      ctx.font = `700 15px ${MONO}`;
      ctx.fillStyle = 'rgba(210,235,255,0.92)';
      ctx.fillText(TITLE_CHIPS[i].label, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
  } else {
    ctx.font = `600 15px ${MONO}`;
    ctx.fillStyle = `hsla(${theme.friendly},90%,72%,0.9)`;
    ctx.fillText('H HOW TO PLAY   T TOP 20   S YOUR SKY   G PROGRESS', W / 2, TIER_Y + TIER_H + 92);
  }

  if (g) drawScores(ctx, g.scores, W / 2, 250, W, { limit: 5, width: 420 });

  ctx.textAlign = 'center';
  ctx.font = `400 12px ${MONO}`;
  ctx.fillStyle = 'rgba(140,180,215,0.4)';
  // The keyboard strip is meaningless on a phone; the menu button carries all
  // of it there.
  if (!touch) {
    ctx.fillText(
      `ESC switch player   ·   C colour-safe ${theme.colorSafe ? 'ON' : 'off'}   ·   R reduced motion ${theme.reducedMotion ? 'ON' : 'off'}   ·   Q quality   ·   M mute`,
      W / 2, H - 26,
    );
  }
  ctx.restore();
}

// One place for every control and every beast, instead of a growing pile of
// lines on the title screen. Reachable from the title and mid-game with H.
const CONTROLS = [
  ['ANSWERING', null],
  ['0 – 9', 'type a number'],
  ['x', 'types × — for factor pairs like 6×8'],
  ['/', 'fraction bar — 3/8'],
  ['−', 'minus, for negative answers (hard)'],
  ['ENTER', 'fire the answer'],
  ['BACKSPACE', 'delete a digit   ·   ESC clears'],
  ['CHOOSING A TARGET', null],
  ['click / tap', 'aim at that beast'],
  ['[  and  ]', 'step target left and right'],
  ['', 'otherwise the turret takes the closest threat'],
  ['SPECIAL', null],
  ['SPACE', 'overcharge beam — clears a whole column'],
  ['TAB', 'switch between typing and four answers'],
];

// Only the beasts the chosen tier actually sends, so the list is a reference
// for this run rather than a catalogue of everything in the game.
const BESTIARY = {
  easy: [
    ['27 + 46', 'Blocks. Rods are tens, squares are ones — count them.'],
    ['52 − 17', 'The struck-out blocks are the ones taken away.'],
    ['7 × 8', 'Grid. Count it if you need to. Type the product — 56.'],
    ['? + 12 = 30', 'Boss. Take away to find the missing number, then check.'],
  ],
  medium: [
    ['7 × 8', 'Grid. Count it if you need to. Type the product — 56.'],
    ['? × ? = 48', 'Boulder. Type one factor (6) or both (6×8).'],
    ['red boulder', 'Prime — nothing divides it. Type the number itself.'],
    ['? / 8', 'Crystal. Count the missing slices: type 3 or 3/8.'],
    ['−6 + ? = 0', 'Voidling. Rises instead of falling. Type 6.'],
    ['3x + 7 = 22', 'Boss. One step at a time; each step cracks a ring.'],
  ],
  hard: [
    ['(−8) × 7', 'Dark chips are negative. Answers can be too — press −.'],
    ['1/2 + 1/3', 'Two discs, unlike slices. Answer as p/q — 5/6.'],
    ['15% of 80', 'The lit part of the bar. Ticks mark every tenth.'],
    ['7²  ·  √81', 'A square: area from the side, or the side from the area.'],
    ['? × ? = 48', 'Boulder. One factor (6) or both (6×8). Red ones are prime.'],
    ['−3x − 5 = −11', 'Boss. Undo the sum, undo the multiply, then check.'],
  ],
};

export function drawHelp(ctx, W, H, g) {
  ctx.save();
  ctx.fillStyle = 'rgba(3,5,14,0.94)';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = `hsla(${theme.friendly},80%,60%,0.3)`;
  ctx.lineWidth = 1.5;
  roundRect(ctx, 62, 44, W - 124, H - 88, 14);
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.font = `700 30px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = `hsla(${theme.friendly},100%,62%,0.8)`;
  ctx.shadowBlur = 22;
  ctx.fillText('HOW TO PLAY', W / 2, 98);
  ctx.shadowBlur = 0;

  // Left column: controls.
  ctx.textAlign = 'left';
  let y = 150;
  for (const [key, desc] of CONTROLS) {
    if (desc === null) {
      y += 12;
      ctx.font = `700 13px ${MONO}`;
      ctx.fillStyle = `hsla(${theme.friendly},90%,66%,0.9)`;
      ctx.fillText(key, 108, y);
      ctx.strokeStyle = `hsla(${theme.friendly},80%,60%,0.22)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(108 + ctx.measureText(key).width + 14, y - 4);
      ctx.lineTo(596, y - 4);
      ctx.stroke();
      y += 26;
      continue;
    }
    ctx.font = `700 15px ${MONO}`;
    ctx.fillStyle = '#e6f3ff';
    ctx.fillText(key, 116, y);
    ctx.font = `400 15px ${MONO}`;
    ctx.fillStyle = 'rgba(160,200,232,0.8)';
    ctx.fillText(desc, 252, y);
    y += 25;
  }

  // Right column: what this tier is actually sending.
  const tierId = (g && g.tier && g.tier.id) || 'medium';
  const list = BESTIARY[tierId] || BESTIARY.medium;
  const heading = `WHAT YOU ARE FIGHTING — ${tierId.toUpperCase()}`;
  y = 150;
  ctx.font = `700 13px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,66%,0.9)`;
  ctx.fillText(heading, 664, y + 12);
  ctx.strokeStyle = `hsla(${theme.friendly},80%,60%,0.22)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(664 + ctx.measureText(heading).width + 14, y + 8);
  ctx.lineTo(W - 108, y + 8);
  ctx.stroke();
  y += 46;
  for (const [label, desc] of list) {
    ctx.font = `700 16px ${MONO}`;
    ctx.fillStyle = '#ffd9b8';
    ctx.fillText(label, 672, y);
    ctx.font = `400 14px ${MONO}`;
    ctx.fillStyle = 'rgba(160,200,232,0.78)';
    ctx.fillText(desc, 672, y + 20);
    y += 48;
  }

  // The one rule that ties it together.
  ctx.textAlign = 'center';
  ctx.font = `500 15px ${MONO}`;
  ctx.fillStyle = 'rgba(190,225,250,0.9)';
  ctx.fillText('Every right answer sends orbs into your shield. An intact plate absorbs one landing.',
               W / 2, H - 106);

  ctx.font = `400 13px ${MONO}`;
  ctx.fillStyle = 'rgba(140,180,215,0.5)';
  ctx.fillText('P pause · M mute · Q quality · C colour-safe · R reduced motion · T top 20 · S sky · G progress',
               W / 2, H - 82);

  ctx.font = `700 15px ${MONO}`;
  ctx.fillStyle = 'rgba(255,232,170,0.9)';
  ctx.fillText(g.touch ? 'tap anywhere to close' : 'H or ESC to close', W / 2, H - 56);
  ctx.restore();
}

export function drawGameOver(ctx, g, W, H, t) {
  const fade = clamp(t / 0.8, 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(4,6,16,${0.82 * fade})`;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = fade;

  ctx.font = `700 72px ${MONO}`;
  ctx.fillStyle = '#ffd9c8';
  ctx.shadowColor = 'hsla(12,100%,60%,0.9)';
  ctx.shadowBlur = 34;
  ctx.fillText('SURFACE BREACHED', W / 2, H / 2 - 150);
  ctx.shadowBlur = 0;

  const acc = g.attempts ? Math.round((g.solved / g.attempts) * 100) : 100;
  ctx.font = `500 22px ${MONO}`;
  ctx.fillStyle = 'rgba(190,225,250,0.92)';
  ctx.fillText(`SCORE ${g.score}    WAVE ${g.wave}    ACCURACY ${acc}%    BEST ×${g.bestCombo}`,
               W / 2, H / 2 - 84);

  const run = g.lastRun;
  if (run && (run.place || run.beat.score)) {
    const s = 1 + Math.sin(t * 3) * 0.03;
    ctx.save();
    ctx.translate(W / 2, H / 2 - 44);
    ctx.scale(s, s);
    ctx.font = `700 30px ${MONO}`;
    ctx.fillStyle = '#fff0c4';
    ctx.shadowColor = 'hsla(46,100%,60%,0.95)';
    ctx.shadowBlur = 26;
    ctx.fillText(
      run.beat.score ? 'NEW PERSONAL BEST' : `#${run.place} ON THE BOARD`,
      0, 0,
    );
    ctx.restore();
  }

  const weak = g.skill.weakest(4);
  if (weak.length) {
    ctx.font = `700 13px ${MONO}`;
    ctx.fillStyle = 'rgba(255,214,140,0.85)';
    ctx.fillText('PRACTISE THESE', W / 2, H / 2 - 4);
    ctx.font = `700 24px ${MONO}`;
    ctx.fillStyle = '#fff0d0';
    ctx.fillText(weak.map((f) => `${f.a}${f.op || '×'}${f.b}`).join('    '), W / 2, H / 2 + 28);
  }

  drawScores(ctx, g.scores, W / 2, H / 2 + 68, W,
             { limit: 5, width: 420, highlight: run ? run.place : 0 });

  const a = 0.55 + Math.sin(t * 4) * 0.45;
  ctx.font = `700 20px ${MONO}`;
  ctx.fillStyle = `rgba(255,232,170,${a * fade})`;
  ctx.fillText(g.touch
    ? 'tap to play again   ·   ☰ for the board and to change player'
    : 'ENTER to play again   ·   T for the full board   ·   ESC to switch player',
    W / 2, H - 42);
  ctx.restore();
}
