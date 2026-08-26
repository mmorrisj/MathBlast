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

const ROW_H = 62;              // the tallest a row gets
const ROW_W = 460;
const GAP = 10;
const TOP = 150;
const FOOT = 52;               // room kept for the "ESC to close" line

// Rows shrink to fit rather than running off the bottom. The title-screen menu
// is eight entries, which at a fixed 62 ran to y=726 in a 720-tall frame: the
// last one was cut in half and the footer was drawn across it.
function layout(n, H) {
  const room = H - FOOT - TOP;
  return { top: TOP, rowH: Math.min(ROW_H, Math.floor((room - (n - 1) * GAP) / n)) };
}

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

export function menuRect(i, W, n = 1, H = 720) {
  const { top, rowH } = layout(n, H);
  return { x: W / 2 - ROW_W / 2, y: top + i * (rowH + GAP), w: ROW_W, h: rowH };
}

export function menuHitTest(px, py, g, W, H = 720) {
  const items = menuItems(g);
  for (let i = 0; i < items.length; i++) {
    const r = menuRect(i, W, items.length, H);
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

  // An unselected row used to be near-black on near-black with a hairline
  // border at three tenths of an alpha: only the highlighted one read as a
  // button at all, and the rest looked like empty space with words on it. They
  // are slabs now -- lit enough to be seen against the overlay, with a border
  // that is actually a border -- and the highlight still wins by a mile.
  items.forEach((item, i) => {
    const r = menuRect(i, W, items.length, H);
    const on = i === g.menuIndex;
    const hue = item.danger ? 12 : theme.friendly;
    ctx.fillStyle = on
      ? `hsla(${hue}, ${item.danger ? 55 : 60}%, 26%, 0.95)`
      : `hsla(${hue}, ${item.danger ? 40 : 45}%, 17%, 0.9)`;
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.lineWidth = on ? 2.6 : 1.6;
    ctx.strokeStyle = on
      ? `hsla(${item.danger ? 12 : 48}, 100%, 70%, ${0.85 + Math.sin(t * 7) * 0.15})`
      : `hsla(${hue}, 80%, 66%, 0.55)`;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = `700 20px ${MONO}`;
    ctx.fillStyle = item.danger ? '#ffd6c8' : (on ? '#fff6dc' : '#dcecfa');
    const twoLine = item.hint && r.h >= 46;
    ctx.fillText(item.label, r.x + 24, r.y + (twoLine ? r.h * 0.38 : r.h / 2));
    if (twoLine) {
      ctx.font = `400 12px ${MONO}`;
      ctx.fillStyle = 'rgba(186,214,238,0.75)';
      ctx.fillText(item.hint, r.x + 24, r.y + r.h * 0.71);
    }
    ctx.textAlign = 'center';
  });

  const last = menuRect(items.length - 1, W, items.length, H);
  ctx.font = `600 14px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,72%,0.9)`;
  ctx.fillText(g.touch ? 'tap outside to close' : 'ESC to close  ·  ↑ ↓ and ENTER to choose',
               W / 2, clamp(last.y + last.h + 30, 0, H - 22));
  ctx.restore();
}
