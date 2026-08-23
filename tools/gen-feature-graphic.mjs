// Regenerates the Play Store feature graphic (1024x500).
//
//   npm start                            # in another shell
//   node tools/gen-feature-graphic.mjs
//
// Drawn with the game's own palette and shapes for the same reason the icons
// are (tools/gen-icons.mjs): a listing image authored separately drifts from
// what the game actually looks like, and the first thing a store visitor does
// is compare the two.
//
// JPEG rather than PNG on purpose. Play's feature graphic must not carry an
// alpha channel, and a canvas PNG always does even when every pixel is opaque.
// JPEG has none by definition, and these are flat gradients, so the artefacts
// that would show on a photograph do not show here.

import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
async function playwright() {
  for (const c of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs',
                   '/usr/lib/node_modules/playwright/index.mjs']) {
    try { return await import(c.startsWith('/') ? c : require.resolve(c)); } catch { /* next */ }
  }
  throw new Error('Playwright not found -- npm i -D playwright && npx playwright install chromium');
}
const { chromium } = await playwright();

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.evaluate(() => document.fonts.load('700 64px "JetBrains Mono"'));
await page.evaluate(() => document.fonts.ready);

const data = await page.evaluate(async () => {
  const { theme } = await import('/src/theme.js');
  const TAU = Math.PI * 2;
  const W = 1024, H = 500;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const mono = '"JetBrains Mono", ui-monospace, monospace';

  // Sky.
  const bg = x.createRadialGradient(W * 0.62, H * 1.5, 0, W * 0.62, H * 1.5, W * 0.95);
  bg.addColorStop(0, '#141a44');
  bg.addColorStop(1, '#04060f');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  // Starfield, deterministic so regenerating does not reshuffle it.
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 220; i++) {
    const a = 0.1 + rnd() * 0.55;
    x.fillStyle = `hsla(${theme.friendly},80%,85%,${a})`;
    const s = rnd() < 0.85 ? 1.5 : 2.5;
    x.fillRect(rnd() * W, rnd() * H * 0.82, s, s);
  }

  // The planet's dome across the bottom, the thing being defended.
  // Sits low enough that the arc clears the text block on the left; at the
  // old radius it ran straight through both grey lines.
  const cy = H * 2.27, r = W * 0.72;
  x.save();
  x.beginPath();
  x.arc(W / 2, cy, r, Math.PI, TAU);
  x.lineWidth = 9;
  x.strokeStyle = `hsla(${theme.friendly},95%,64%,0.95)`;
  x.shadowColor = `hsla(${theme.friendly},100%,60%,0.9)`;
  x.shadowBlur = 40;
  x.stroke();
  x.restore();

  // A countable 7x8 lattice -- the game's central idea, so it is the picture.
  const cols = 7, rows = 8, cell = 15, gap = 3;
  const gw = cols * cell + (cols - 1) * gap, gh = rows * cell + (rows - 1) * gap;
  const gx0 = W * 0.735 - gw / 2, gy0 = H * 0.30 - gh / 2;

  x.save();
  x.shadowColor = `hsla(${theme.hostile},100%,60%,0.55)`;
  x.shadowBlur = 26;
  x.fillStyle = 'rgba(10,18,34,0.55)';
  x.fillRect(gx0 - 13, gy0 - 13, gw + 26, gh + 26);
  x.restore();
  x.lineWidth = 2.5;
  x.strokeStyle = `hsla(${theme.hostile},90%,62%,0.95)`;
  x.strokeRect(gx0 - 13, gy0 - 13, gw + 26, gh + 26);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // Brightness varies a little so the cells read as countable units rather
      // than a texture.
      const lit = 0.55 + ((i * 3 + j * 5) % 7) / 16;
      x.fillStyle = `hsla(${theme.hostile},85%,${52 + lit * 14}%,${0.72 + lit * 0.25})`;
      x.fillRect(gx0 + i * (cell + gap), gy0 + j * (cell + gap), cell, cell);
    }
  }

  // The label, so a reader who does not count still sees what it is.
  x.font = `700 30px ${mono}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#eaf6ff';
  x.shadowColor = 'rgba(0,0,0,0.85)';
  x.shadowBlur = 10;
  x.fillText('7 × 8', W * 0.735, gy0 + gh + 42);
  x.shadowBlur = 0;

  // The answer bolt on its way up.
  const bx = W * 0.735, by0 = cy - r, by1 = gy0 + gh + 66;
  const beam = x.createLinearGradient(bx, by0, bx, by1);
  beam.addColorStop(0, `hsla(${theme.friendly},100%,72%,0)`);
  beam.addColorStop(1, `hsla(${theme.friendly},100%,74%,0.9)`);
  x.fillStyle = beam;
  x.fillRect(bx - 3.5, by1, 7, by0 - by1);

  // Title block, kept well inside the left half -- Play crops this image on
  // some surfaces and overlays a play button in the middle on others.
  x.textAlign = 'left';
  x.shadowColor = 'rgba(0,0,0,0.7)';
  x.shadowBlur = 18;

  x.font = `700 78px ${mono}`;
  x.fillStyle = '#f2f8ff';
  x.fillText('MathBlast', 62, 196);

  x.font = `500 26px ${mono}`;
  x.fillStyle = `hsla(${theme.friendly},90%,74%,0.98)`;
  x.fillText('The math IS the game.', 66, 262);

  x.font = `400 20px ${mono}`;
  x.fillStyle = '#9fb2d8';
  x.fillText('Grades 1–7  ·  Adapts to your child', 66, 312);
  x.fillText('No ads  ·  No tracking  ·  Plays offline', 66, 344);
  x.shadowBlur = 0;

  return c.toDataURL('image/jpeg', 0.94);
});

mkdirSync('docs/store', { recursive: true });
const buf = Buffer.from(data.split(',')[1], 'base64');
writeFileSync('docs/store/feature-graphic.jpg', buf);
console.log(`wrote docs/store/feature-graphic.jpg (${(buf.length / 1024).toFixed(0)} KB, 1024x500, no alpha)`);
await browser.close();
