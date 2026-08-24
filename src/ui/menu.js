// The menu.
//
// Touch navigation had grown into a row of five unlabelled glyphs -- ? || * +
// -- and mid-run it had none of them, so a player on a phone could not leave a
// run at all. Nor could one on a keyboard: ESC while playing clears the answer
// box and falls through, so switching player meant dying or reloading the page.
//
// One labelled list replaces the glyph row, adapts to what the player is doing,
// and works by tap, by arrow keys and by the Android back button.

import { roundRect, clamp } from '../util.js';
import { theme } from '../theme.js';

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const ROW_H = 62;
const ROW_W = 460;
const GAP = 10;
const TOP = 150;

// `danger: true` marks an entry that ends the run, so it can be set apart and
// is never the one a stray tap lands on first.
export function menuItems(g) {
  const playing = g.state === 'playing';
  const items = [];
  if (playing) {
    items.push({ id: 'resume', label: 'Resume', hint: 'back to the run' });
  } else if (g.state === 'gameover') {
    items.push({ id: 'play', label: 'Play again', hint: '' });
  } else {
    items.push({ id: 'play', label: 'Play', hint: g.tier.name.toLowerCase() });
  }
  if (!playing) {
    items.push({ id: 'board', label: 'Top 20', hint: 'high scores' });
    items.push({ id: 'sky', label: 'Your sky', hint: 'times tables you have lit' });
    items.push({ id: 'report', label: 'Progress', hint: 'coverage, for a grown-up' });
  }
  items.push({ id: 'help', label: 'How to play', hint: '' });
  // Available mid-run too: the moment you want to look something up is the
  // moment it just beat you.
  items.push({ id: 'codex', label: 'The codex', hint: 'every challenge, explained' });
  items.push({ id: 'mute', label: g.audio.muted ? 'Sound off' : 'Sound on', hint: 'tap to switch' });
  items.push({ id: 'player', label: 'Change player', hint: playing ? 'ends this run' : '', danger: playing });
  if (playing) items.push({ id: 'quit', label: 'End run', hint: 'keeps your score', danger: true });
  return items;
}

export function menuRect(i, W) {
  return { x: W / 2 - ROW_W / 2, y: TOP + i * (ROW_H + GAP), w: ROW_W, h: ROW_H };
}

export function menuHitTest(px, py, g, W) {
  const items = menuItems(g);
  for (let i = 0; i < items.length; i++) {
    const r = menuRect(i, W);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return items[i].id;
  }
  return null;
}

export function drawMenu(ctx, g, W, H, t) {
  const items = menuItems(g);
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,16,0.93)';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  ctx.font = `700 26px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = `hsla(${theme.friendly},100%,60%,0.8)`;
  ctx.shadowBlur = 20;
  ctx.fillText('MENU', W / 2, 86);
  ctx.shadowBlur = 0;

  const player = g.profiles.active;
  if (player) {
    ctx.font = `400 13px ${MONO}`;
    ctx.fillStyle = 'rgba(150,190,220,0.6)';
    ctx.fillText(`playing as ${player.name}`, W / 2, 112);
  }

  items.forEach((item, i) => {
    const r = menuRect(i, W);
    const on = i === g.menuIndex;
    ctx.fillStyle = on ? 'rgba(18,38,62,0.95)' : 'rgba(10,18,34,0.7)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.lineWidth = on ? 2.4 : 1.2;
    ctx.strokeStyle = on
      ? `hsla(${item.danger ? 12 : 48}, 100%, 70%, ${0.85 + Math.sin(t * 7) * 0.15})`
      : `hsla(${item.danger ? 12 : theme.friendly}, 70%, 60%, 0.3)`;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = `700 20px ${MONO}`;
    ctx.fillStyle = item.danger ? '#ffd0c0' : (on ? '#fff6dc' : 'rgba(200,228,248,0.9)');
    ctx.fillText(item.label, r.x + 24, r.y + (item.hint ? 24 : r.h / 2));
    if (item.hint) {
      ctx.font = `400 12px ${MONO}`;
      ctx.fillStyle = 'rgba(150,190,220,0.55)';
      ctx.fillText(item.hint, r.x + 24, r.y + 44);
    }
    ctx.textAlign = 'center';
  });

  ctx.font = `600 14px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,72%,0.9)`;
  ctx.fillText(g.touch ? 'tap outside to close' : 'ESC to close  ·  ↑ ↓ and ENTER to choose',
               W / 2, clamp(TOP + items.length * (ROW_H + GAP) + 34, 0, H - 26));
  ctx.restore();
}
