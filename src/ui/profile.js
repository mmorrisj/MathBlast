// Profile picker, name entry and the high-score table.
//
// Name entry hands off to a real DOM <input> laid over the canvas rather than
// building a letter grid: on a phone that summons the native keyboard, which is
// better than anything drawable here, and on a desktop it just works.

import { roundRect, clamp } from '../util.js';
import { theme } from '../theme.js';

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const ROW_H = 62;
const ROW_W = 520;
const LIST_TOP = 208;
export const MAX_ROWS = 5;

export function profileRow(i, W) {
  return { x: W / 2 - ROW_W / 2, y: LIST_TOP + i * (ROW_H + 12), w: ROW_W, h: ROW_H };
}

export function newProfileRow(count, W) {
  const r = profileRow(Math.min(count, MAX_ROWS), W);
  return { ...r, h: 54 };
}

// Returns 'new', a profile index, or null.
export function profileHitTest(px, py, count, W) {
  const shown = Math.min(count, MAX_ROWS);
  for (let i = 0; i < shown; i++) {
    const r = profileRow(i, W);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
  }
  const n = newProfileRow(count, W);
  if (px >= n.x && px <= n.x + n.w && py >= n.y && py <= n.y + n.h) return 'new';
  return null;
}

export function drawProfiles(ctx, g, W, H, t) {
  const profiles = g.profiles.list;
  const sel = g.profileIndex;

  ctx.save();
  ctx.fillStyle = 'rgba(4,6,16,0.93)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 46px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = `hsla(${theme.friendly},100%,62%,0.85)`;
  ctx.shadowBlur = 28;
  ctx.fillText('WHO IS PLAYING?', W / 2, 128);
  ctx.shadowBlur = 0;

  if (g.naming) {
    drawNaming(ctx, g, W, H, t);
    ctx.restore();
    return;
  }

  const shown = Math.min(profiles.length, MAX_ROWS);
  for (let i = 0; i < shown; i++) {
    const p = profiles[i];
    const r = profileRow(i, W);
    const on = i === sel;
    ctx.fillStyle = on ? 'rgba(16,34,58,0.9)' : 'rgba(10,18,34,0.75)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.lineWidth = on ? 2.4 : 1.3;
    ctx.strokeStyle = on
      ? `hsla(48,100%,70%,${0.85 + Math.sin(t * 7) * 0.15})`
      : `hsla(${theme.friendly},70%,60%,0.34)`;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = `700 24px ${MONO}`;
    ctx.fillStyle = on ? '#fff6dc' : '#dceeff';
    ctx.fillText(p.name, r.x + 24, r.y + r.h / 2 - 8);

    ctx.font = `400 14px ${MONO}`;
    ctx.fillStyle = 'rgba(160,200,232,0.7)';
    const acc = p.attempts ? Math.round((p.solved / p.attempts) * 100) : 100;
    ctx.fillText(
      p.games
        ? `best ${p.bestScore}   ·   wave ${p.bestWave}   ·   ${acc}%   ·   ${p.games} run${p.games === 1 ? '' : 's'}`
        : 'no runs yet',
      r.x + 24, r.y + r.h / 2 + 16,
    );
    ctx.textAlign = 'center';
  }

  const n = newProfileRow(profiles.length, W);
  const onNew = sel === shown;
  ctx.fillStyle = 'rgba(10,18,34,0.6)';
  roundRect(ctx, n.x, n.y, n.w, n.h, 12);
  ctx.fill();
  ctx.lineWidth = onNew ? 2.4 : 1.3;
  ctx.strokeStyle = onNew
    ? `hsla(48,100%,70%,${0.85 + Math.sin(t * 7) * 0.15})`
    : `hsla(${theme.friendly},70%,60%,0.3)`;
  ctx.setLineDash(onNew ? [] : [6, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `600 19px ${MONO}`;
  ctx.fillStyle = onNew ? '#fff6dc' : 'rgba(180,214,240,0.8)';
  ctx.fillText('+  NEW PLAYER', W / 2, n.y + n.h / 2 + 1);

  ctx.font = `400 14px ${MONO}`;
  ctx.fillStyle = 'rgba(140,180,215,0.55)';
  ctx.fillText(g.touch ? 'tap a name to play' : '↑ ↓ choose   ·   ENTER play   ·   DEL remove',
               W / 2, H - 56);
  ctx.restore();
}

function drawNaming(ctx, g, W, H, t) {
  ctx.textAlign = 'center';
  ctx.font = `500 20px ${MONO}`;
  ctx.fillStyle = 'rgba(170,215,245,0.85)';
  ctx.fillText('What should we call you?', W / 2, 210);

  const bw = 460, bh = 76, bx = W / 2 - bw / 2, by = 250;
  ctx.fillStyle = 'rgba(10,20,38,0.85)';
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `hsla(${theme.friendly},90%,64%,0.85)`;
  ctx.stroke();

  const name = g.nameDraft || '';
  ctx.font = `700 34px ${MONO}`;
  ctx.fillStyle = name ? '#f2fffa' : 'rgba(150,200,235,0.35)';
  ctx.fillText(name || 'name', W / 2, by + bh / 2 + 2);
  if (name && Math.sin(t * 6) > 0) {
    const w = ctx.measureText(name).width;
    ctx.fillStyle = `hsla(${theme.friendly},100%,70%,0.8)`;
    ctx.fillRect(W / 2 + w / 2 + 8, by + 18, 3, bh - 36);
  }

  if (g.nameError) {
    ctx.font = `500 15px ${MONO}`;
    ctx.fillStyle = 'rgba(255,150,140,0.9)';
    ctx.fillText(g.nameError, W / 2, by + bh + 30);
  }

  const ok = Boolean(name);
  const okBtn = nameButton(W, H);
  ctx.fillStyle = ok ? 'rgba(18,44,40,0.9)' : 'rgba(12,20,34,0.6)';
  roundRect(ctx, okBtn.x, okBtn.y, okBtn.w, okBtn.h, 12);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ok ? 'hsla(155,100%,62%,0.9)' : 'rgba(120,150,180,0.3)';
  ctx.stroke();
  ctx.font = `700 21px ${MONO}`;
  ctx.fillStyle = ok ? '#eafff4' : 'rgba(150,180,205,0.5)';
  ctx.fillText('START', okBtn.x + okBtn.w / 2, okBtn.y + okBtn.h / 2 + 1);

  ctx.font = `400 14px ${MONO}`;
  ctx.fillStyle = 'rgba(140,180,215,0.5)';
  ctx.fillText('ESC to go back', W / 2, H - 56);
}

export function nameButton(W, H) {
  return { x: W / 2 - 90, y: 386, w: 180, h: 56 };
}

// Shown on the title screen and after a run.
export function drawScores(ctx, scores, x, y, W, opts = {}) {
  const rows = scores.list.slice(0, opts.limit || 5);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `700 13px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,66%,0.85)`;
  ctx.fillText('TOP SCORES', x, y);

  if (!rows.length) {
    ctx.font = `400 14px ${MONO}`;
    ctx.fillStyle = 'rgba(150,190,220,0.5)';
    ctx.fillText('no runs yet — be the first', x, y + 30);
    ctx.restore();
    return;
  }

  const w = opts.width || 460;
  rows.forEach((r, i) => {
    const ry = y + 30 + i * 26;
    const hot = opts.highlight != null && opts.highlight === i + 1;
    ctx.font = `${hot ? 700 : 400} 16px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = hot ? '#fff2c8' : 'rgba(200,228,248,0.8)';
    ctx.fillText(`${i + 1}.`, x - w / 2, ry);
    ctx.fillText(r.name, x - w / 2 + 40, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = hot ? '#fff2c8' : 'rgba(200,228,248,0.8)';
    ctx.fillText(String(r.score), x + w / 2 - 96, ry);
    ctx.fillStyle = hot ? 'rgba(255,226,150,0.8)' : 'rgba(150,190,220,0.55)';
    ctx.font = `400 13px ${MONO}`;
    ctx.fillText(`wave ${r.wave}`, x + w / 2, ry);
  });
  ctx.restore();
}
