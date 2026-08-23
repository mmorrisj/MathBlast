// Touch controls.
//
// On a coarse pointer there is no keyboard, so every action that mattered on a
// key needs a target you can hit with a thumb. Buttons are sized to the ~44px
// physical minimum once the 1280x720 canvas is scaled down to a phone, which is
// why they look oversized in a desktop screenshot.

import { roundRect, clamp, TAU } from '../util.js';
import { theme } from '../theme.js';

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export const BTN = 74;
const PAD = 18;

// Laid out in canvas space; the same rects drive drawing and hit testing, so
// they cannot drift apart.
export function touchButtons(g, W, H) {
  // Bottom corners: clear of the score/cores/shield readouts along the top, and
  // where thumbs already rest when the device is held in landscape.
  const out = [
    { id: 'help', label: '?', x: W - PAD - BTN, y: H - PAD - BTN, w: BTN, h: BTN },
    { id: 'pause', label: '||', x: W - PAD * 2 - BTN * 2, y: H - PAD - BTN, w: BTN, h: BTN },
  ];
  // The board is only offered between runs: mid-run there is no room for it
  // beside the beam, and no reason to read it.
  if (g.state !== 'playing') {
    out.push({ id: 'board', label: '★', x: W - PAD * 3 - BTN * 3, y: H - PAD - BTN, w: BTN, h: BTN });
    out.push({ id: 'sky', label: '✦', x: W - PAD * 4 - BTN * 4, y: H - PAD - BTN, w: BTN, h: BTN });
  }
  if (g.state === 'playing') {
    out.push({
      id: 'beam',
      label: '⚡',
      x: PAD,
      y: H - PAD - BTN,
      w: BTN * 1.5,
      h: BTN,
      ready: g.overcharge >= 1,
      fill: clamp(g.overcharge, 0, 1),
    });
  }
  return out;
}

export function touchHitTest(px, py, buttons) {
  for (const b of buttons) {
    // A slightly generous box: thumbs are imprecise and these are all safe.
    if (px >= b.x - 8 && px <= b.x + b.w + 8 && py >= b.y - 8 && py <= b.y + b.h + 8) return b.id;
  }
  return null;
}

export function drawTouchButtons(ctx, buttons, t) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of buttons) {
    const hot = b.ready;
    ctx.fillStyle = 'rgba(9,16,32,0.72)';
    roundRect(ctx, b.x, b.y, b.w, b.h, 16);
    ctx.fill();

    if (b.fill != null && b.fill > 0) {
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, b.x, b.y, b.w, b.h, 16);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hot
        ? `hsla(48,100%,${58 + Math.sin(t * 12) * 16}%,0.4)`
        : `hsla(${theme.friendly},100%,58%,0.24)`;
      ctx.fillRect(b.x, b.y + b.h * (1 - b.fill), b.w, b.h * b.fill);
      ctx.restore();
    }

    ctx.lineWidth = hot ? 2.6 : 1.6;
    ctx.strokeStyle = hot
      ? `hsla(48,100%,72%,${0.8 + Math.sin(t * 12) * 0.2})`
      : `hsla(${theme.friendly},80%,64%,0.5)`;
    roundRect(ctx, b.x, b.y, b.w, b.h, 16);
    ctx.stroke();

    ctx.font = `700 ${b.id === 'beam' ? 30 : 26}px ${MONO}`;
    ctx.fillStyle = hot ? '#fff4d4' : 'rgba(214,238,255,0.9)';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
  ctx.restore();
}

// A phone held upright cannot show a 16:9 playfield at a usable size, so say so
// rather than rendering something unplayable.
export function drawRotate(ctx, W, H, t) {
  ctx.save();
  ctx.fillStyle = '#04060f';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2 - 30);
  ctx.save();
  ctx.rotate(Math.sin(t * 1.4) * 0.35 - 0.2);
  ctx.strokeStyle = `hsla(${theme.friendly},90%,70%,0.9)`;
  ctx.lineWidth = 5;
  roundRect(ctx, -52, -86, 104, 172, 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 64, 5, 0, TAU);
  ctx.fillStyle = `hsla(${theme.friendly},90%,70%,0.9)`;
  ctx.fill();
  ctx.restore();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 34px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.fillText('TURN YOUR DEVICE', W / 2, H / 2 + 120);
  ctx.font = `400 18px ${MONO}`;
  ctx.fillStyle = 'rgba(160,200,232,0.75)';
  ctx.fillText('MathBlast plays in landscape', W / 2, H / 2 + 158);
  ctx.restore();
}
