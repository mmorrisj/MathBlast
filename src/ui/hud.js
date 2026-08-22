// HUD and overlays. The readouts are drawn into the scene before post so they
// pick up bloom; the title, interlude and game-over screens go on top of it so
// they stay crisp and full colour.

import { clamp, lerp, easeOutElastic, easeOutCubic, roundRect, TAU } from '../util.js';
import { theme } from '../theme.js';

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export const ENTRY_Y = 674;
const CHOICE_W = 132;
const CHOICE_H = 58;
const CHOICE_GAP = 14;

function choiceRect(i, count) {
  const total = count * CHOICE_W + (count - 1) * CHOICE_GAP;
  const x0 = 640 - total / 2;
  return { x: x0 + i * (CHOICE_W + CHOICE_GAP), y: ENTRY_Y - CHOICE_H / 2, w: CHOICE_W, h: CHOICE_H };
}

export function choiceHitTest(px, py, choices) {
  for (let i = 0; i < choices.length; i++) {
    const r = choiceRect(i, choices.length);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
  }
  return -1;
}

let topScrim = null;

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
    const label = `WAVE ${g.wave}`;
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

  // Overcharge.
  const ready = g.overcharge >= 1;
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
  ctx.textAlign = 'center';
  ctx.font = `500 12px ${MONO}`;
  ctx.fillStyle = manual ? 'rgba(255,226,150,0.85)' : 'rgba(150,200,235,0.45)';
  ctx.fillText(
    manual ? 'TARGET LOCKED — [ ] or click to switch' : 'AUTO-TARGET — [ ] or click to choose',
    W / 2, ENTRY_Y - 44,
  );

  drawEntry(ctx, g, W, H);
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
      ctx.font = `500 20px ${MONO}`;
      ctx.fillStyle = 'rgba(160,205,240,0.75)';
      ctx.fillText(target.hintText, W / 2, ENTRY_Y - 58);
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
      ctx.font = `700 30px ${MONO}`;
      ctx.fillStyle = sel ? '#fff6dc' : 'rgba(220,238,252,0.85)';
      ctx.fillText(g.choices[i], r.x + r.w / 2, r.y + r.h / 2 + 1);
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
  ctx.textAlign = 'center';
  ctx.font = `500 12px ${MONO}`;
  ctx.fillStyle = manual ? 'rgba(255,226,150,0.85)' : 'rgba(150,200,235,0.45)';
  ctx.fillText(
    manual ? 'TARGET LOCKED — [ ] or click to switch' : 'AUTO-TARGET — [ ] or click to choose',
    W / 2, ENTRY_Y - 44,
  );

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

  if (g.lastPerfect) {
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

export function drawTitle(ctx, W, H, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,16,0.74)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const bob = Math.sin(t * 1.6) * 6;
  ctx.font = `700 96px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = `hsla(${theme.friendly},100%,60%,0.9)`;
  ctx.shadowBlur = 40;
  ctx.fillText('MATHBLAST', W / 2, H / 2 - 150 + bob);
  ctx.shadowBlur = 0;

  ctx.font = `500 20px ${MONO}`;
  ctx.fillStyle = 'rgba(170,215,245,0.85)';
  ctx.fillText('The beasts are descending. Solve to stop them.', W / 2, H / 2 - 82);

  const lines = [
    'TYPE the answer  ·  ENTER fire  ·  SPACE overcharge beam',
    'Boulders take one factor (6) or both (6×8) — x types the ×.',
    'Click a beast, or press [ and ], to choose which one to solve.',
    'Tap or use a gamepad to pick from four answers instead.',
    '',
    'Grids ask for the product.  Boulders ask for any factor —',
    'red ones are prime, so type the number itself.',
    '',
    'Correct answers release orbs that build your shield.',
    'An intact plate absorbs one landing.',
  ];
  ctx.font = `400 16px ${MONO}`;
  lines.forEach((l, i) => {
    ctx.fillStyle = 'rgba(150,200,235,0.62)';
    ctx.fillText(l, W / 2, H / 2 - 30 + i * 25);
  });

  ctx.font = `400 13px ${MONO}`;
  ctx.fillStyle = 'rgba(140,180,215,0.45)';
  ctx.fillText(
    `C colour-safe ${theme.colorSafe ? 'ON' : 'off'}   ·   R reduced motion ${theme.reducedMotion ? 'ON' : 'off'}   ·   Q quality   ·   M mute`,
    W / 2, H / 2 + 122,
  );

  const a = 0.55 + Math.sin(t * 4) * 0.45;
  ctx.font = `700 24px ${MONO}`;
  ctx.fillStyle = `rgba(255,232,170,${a})`;
  ctx.fillText('PRESS ENTER TO BEGIN', W / 2, H / 2 + 178);
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

  const weak = g.skill.weakest(4);
  if (weak.length) {
    ctx.font = `700 16px ${MONO}`;
    ctx.fillStyle = 'rgba(255,214,140,0.9)';
    ctx.fillText('PRACTISE THESE', W / 2, H / 2 - 26);
    ctx.font = `700 30px ${MONO}`;
    ctx.fillStyle = '#fff0d0';
    ctx.fillText(weak.map((f) => `${f.a}×${f.b}`).join('    '), W / 2, H / 2 + 18);
    ctx.font = `400 14px ${MONO}`;
    ctx.fillStyle = 'rgba(150,200,235,0.55)';
    ctx.fillText('these will show up more often next run', W / 2, H / 2 + 48);
  }

  const a = 0.55 + Math.sin(t * 4) * 0.45;
  ctx.font = `700 22px ${MONO}`;
  ctx.fillStyle = `rgba(255,232,170,${a * fade})`;
  ctx.fillText('PRESS ENTER TO REDEPLOY', W / 2, H / 2 + 130);
  ctx.restore();
}
