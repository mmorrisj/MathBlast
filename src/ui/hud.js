// HUD. Drawn into the scene buffer before post so it picks up bloom, then the
// title/game-over overlays go on top.

import { clamp, lerp, easeOutElastic, roundRect } from '../util.js';

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

let topScrim = null;

export function drawHud(ctx, g, W, H) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Beasts descend straight through the top row of the HUD. A soft scrim keeps
  // the readouts legible without hiding what is behind them.
  if (!topScrim) {
    topScrim = ctx.createLinearGradient(0, 0, 0, 170);
    topScrim.addColorStop(0, 'rgba(4,7,18,0.72)');
    topScrim.addColorStop(0.6, 'rgba(4,7,18,0.34)');
    topScrim.addColorStop(1, 'rgba(4,7,18,0)');
  }
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, W, 170);

  // --- score -------------------------------------------------------------
  ctx.textAlign = 'left';
  ctx.font = `700 15px ${MONO}`;
  ctx.fillStyle = 'rgba(150,200,235,0.6)';
  ctx.fillText('SCORE', 34, 46);
  ctx.font = `700 44px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = 'rgba(120,220,255,0.7)';
  ctx.shadowBlur = 16;
  ctx.fillText(String(g.score).padStart(6, '0'), 34, 88);
  ctx.shadowBlur = 0;

  const acc = g.attempts ? Math.round((g.solved / g.attempts) * 100) : 100;
  ctx.font = `500 14px ${MONO}`;
  ctx.fillStyle = 'rgba(150,200,235,0.5)';
  ctx.fillText(`ACCURACY ${acc}%   BEST ×${g.bestCombo}`, 34, 112);

  // --- wave --------------------------------------------------------------
  ctx.textAlign = 'center';
  ctx.font = `700 15px ${MONO}`;
  ctx.fillStyle = 'rgba(150,200,235,0.6)';
  ctx.fillText(`WAVE ${g.wave}`, W / 2, 46);
  if (g.waveBanner > 0) {
    const t = 1 - g.waveBanner / 2.2;
    const a = Math.sin(clamp(t, 0, 1) * Math.PI);
    ctx.font = `700 62px ${MONO}`;
    ctx.fillStyle = `rgba(255,236,180,${a})`;
    ctx.shadowColor = 'rgba(255,190,80,0.9)';
    ctx.shadowBlur = 30;
    ctx.fillText(`WAVE ${g.wave}`, W / 2, H / 2 - 40);
    ctx.shadowBlur = 0;
  }

  // --- cores -------------------------------------------------------------
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
    ctx.fillStyle = on ? 'hsla(188,100%,62%,0.9)' : 'rgba(90,110,140,0.28)';
    roundRect(ctx, -10, -10, 20, 20, 3);
    ctx.fill();
    ctx.restore();
  }

  // --- combo ladder ------------------------------------------------------
  // Five rungs = the five degrees of the pentatonic scale the audio is walking.
  // Watching the rung climb is watching the melody you are about to play.
  const rungs = 5;
  const step = g.combo > 0 ? (g.combo - 1) % rungs : -1;
  const oct = g.combo > 0 ? Math.min(Math.floor((g.combo - 1) / rungs), 2) : 0;
  ctx.textAlign = 'left';
  for (let i = 0; i < rungs; i++) {
    const y = 300 - i * 26;
    const lit = i <= step;
    ctx.save();
    ctx.globalCompositeOperation = lit ? 'lighter' : 'source-over';
    const hue = 150 + oct * 28;
    ctx.fillStyle = lit
      ? `hsla(${hue}, 100%, ${58 + i * 4}%, ${0.55 + 0.45 * (i === step ? 1 : 0.4)})`
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

  // --- shield coverage ---------------------------------------------------
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
  ctx.fillStyle = 'hsla(188,100%,60%,0.85)';
  roundRect(ctx, bx, by, Math.max(2, bw * cov), 8, 4);
  ctx.fill();
  ctx.restore();

  // --- answer entry ------------------------------------------------------
  drawEntry(ctx, g, W, H);
  ctx.restore();
}

// The typed number inflates and settles on every keystroke. Cheap, and it makes
// the input feel like part of the game rather than a form field.
export const ENTRY_Y = 674;

function drawEntry(ctx, g, W, H) {
  const target = g.targetBeast;
  const y = ENTRY_Y;
  const pulse = g.inputPulse > 0 ? easeOutElastic(1 - g.inputPulse) : 1;
  const scale = lerp(1.32, 1, clamp(pulse, 0, 1));

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (target) {
    ctx.font = `500 22px ${MONO}`;
    ctx.fillStyle = 'rgba(160,205,240,0.7)';
    ctx.fillText(`${target.a} × ${target.b} =`, W / 2 - 96, y);
  }

  const txt = g.input || '';
  ctx.translate(W / 2 + 40, y);
  ctx.scale(scale, scale);

  const boxW = 168, boxH = 56;
  ctx.fillStyle = 'rgba(10,20,38,0.8)';
  roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 10);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = txt
    ? 'hsla(155,100%,62%,0.9)'
    : `hsla(188,80%,60%,${0.35 + Math.sin(g.time * 4) * 0.15})`;
  ctx.stroke();

  if (txt) {
    ctx.font = `700 40px ${MONO}`;
    ctx.fillStyle = '#f2fffa';
    ctx.shadowColor = 'hsla(155,100%,60%,0.9)';
    ctx.shadowBlur = 18;
    ctx.fillText(txt, 0, 2);
  } else {
    ctx.font = `500 15px ${MONO}`;
    ctx.fillStyle = 'rgba(150,200,235,0.4)';
    ctx.fillText('TYPE ANSWER', 0, 2);
  }
  ctx.restore();
}

export function drawTitle(ctx, W, H, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,16,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const bob = Math.sin(t * 1.6) * 6;
  ctx.font = `700 96px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = 'hsla(188,100%,60%,0.9)';
  ctx.shadowBlur = 40;
  ctx.fillText('MATHBLAST', W / 2, H / 2 - 90 + bob);
  ctx.shadowBlur = 0;

  ctx.font = `500 20px ${MONO}`;
  ctx.fillStyle = 'rgba(170,215,245,0.85)';
  ctx.fillText('The beasts are descending. Solve to stop them.', W / 2, H / 2 - 20);

  const lines = [
    'TYPE  the answer to the highlighted beast',
    'ENTER fire      BACKSPACE clear a digit',
    'Every correct answer welds a plate onto your shield.',
    'An intact plate absorbs one landing. Wrong answers crack it.',
  ];
  ctx.font = `400 16px ${MONO}`;
  lines.forEach((l, i) => {
    ctx.fillStyle = 'rgba(150,200,235,0.6)';
    ctx.fillText(l, W / 2, H / 2 + 34 + i * 26);
  });

  const a = 0.55 + Math.sin(t * 4) * 0.45;
  ctx.font = `700 24px ${MONO}`;
  ctx.fillStyle = `rgba(255,232,170,${a})`;
  ctx.fillText('PRESS ENTER TO BEGIN', W / 2, H / 2 + 170);
  ctx.restore();
}

export function drawGameOver(ctx, g, W, H, t) {
  const fade = clamp(t / 0.8, 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(4,6,16,${0.82 * fade})`;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `700 72px ${MONO}`;
  ctx.fillStyle = '#ffd9c8';
  ctx.shadowColor = 'hsla(12,100%,60%,0.9)';
  ctx.shadowBlur = 34;
  ctx.globalAlpha = fade;
  ctx.fillText('SURFACE BREACHED', W / 2, H / 2 - 150);
  ctx.shadowBlur = 0;

  const acc = g.attempts ? Math.round((g.solved / g.attempts) * 100) : 100;
  ctx.font = `500 22px ${MONO}`;
  ctx.fillStyle = 'rgba(190,225,250,0.92)';
  ctx.fillText(`SCORE ${g.score}    WAVE ${g.wave}    ACCURACY ${acc}%    BEST ×${g.bestCombo}`, W / 2, H / 2 - 84);

  // Adaptive payoff: name the facts that actually cost them.
  const weak = g.skill.weakest(4);
  if (weak.length) {
    ctx.font = `700 16px ${MONO}`;
    ctx.fillStyle = 'rgba(255,214,140,0.9)';
    ctx.fillText('PRACTISE THESE', W / 2, H / 2 - 26);
    ctx.font = `700 30px ${MONO}`;
    ctx.fillStyle = '#fff0d0';
    const line = weak.map((f) => `${f.a}×${f.b}`).join('    ');
    ctx.fillText(line, W / 2, H / 2 + 18);
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

// Redrawn on top of the post chain during slow motion. The scene behind is
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
    ctx.fillText(`${t.a} × ${t.b}`, t.x, t.y - t.h / 2 - 14);
    ctx.restore();
  }

  drawEntry(ctx, g, W, H);
  ctx.restore();
}
