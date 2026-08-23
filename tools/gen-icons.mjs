// Regenerates the launcher icons.
//
//   npm start                      # in another shell
//   node tools/gen-icons.mjs
//
// The icon is drawn with the game's own palette and shapes -- the friendly dome
// under a hostile beast carrying a problem -- rather than authored separately,
// so it cannot drift from the game's look. It needs a browser for the canvas,
// which is why this is a Playwright script rather than a build step; icons
// change about once a project, so it is run by hand.
//
// PNGs come out of toDataURL unoptimised (the 1024 is ~800KB). They are
// quantised to 128 colours afterwards -- these are flat dark gradients, so the
// difference is invisible and the files land around a tenth of the size:
//
//   python3 -c "from PIL import Image; import sys, os; [Image.open(p).convert('RGB').quantize(colors=128).save(p, optimize=True) for p in sys.argv[1:]]" assets/icons/*.png

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

// Draw the icon on an offscreen canvas using the game's own palette and the
// dome/beast language, then hand back a PNG.
const shots = await page.evaluate(async () => {
  const { theme } = await import('/src/theme.js');
  const TAU = Math.PI * 2;

  function paint(S, maskable) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    // Maskable icons are cropped to a circle of ~80% width by the launcher, so
    // everything important stays inside a centred safe zone.
    const pad = maskable ? S * 0.14 : 0;
    const inner = S - pad * 2;

    const bg = x.createRadialGradient(S / 2, S * 1.15, 0, S / 2, S * 1.15, S);
    bg.addColorStop(0, '#12163a');
    bg.addColorStop(1, '#04060f');
    x.fillStyle = bg;
    x.fillRect(0, 0, S, S);

    // Starfield.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < Math.round(S / 5); i++) {
      const a = 0.15 + rnd() * 0.5;
      x.fillStyle = `hsla(${theme.friendly},80%,80%,${a})`;
      x.fillRect(rnd() * S, rnd() * S * 0.7, 1.5, 1.5);
    }

    // The planet's dome, an arc across the lower third.
    const cy = pad + inner * 1.44;
    const r = inner * 0.78;
    x.save();
    x.beginPath();
    x.arc(S / 2, cy, r, Math.PI, TAU);
    x.lineWidth = inner * 0.045;
    x.strokeStyle = `hsla(${theme.friendly},95%,62%,0.95)`;
    x.shadowColor = `hsla(${theme.friendly},100%,60%,0.9)`;
    x.shadowBlur = inner * 0.12;
    x.stroke();
    x.restore();

    // A beam rising from the dome into the beast.
    const gx = S / 2;
    const beamTop = pad + inner * 0.34;
    const grad = x.createLinearGradient(gx, cy - r, gx, beamTop);
    grad.addColorStop(0, `hsla(${theme.friendly},100%,72%,0.85)`);
    grad.addColorStop(1, `hsla(${theme.friendly},100%,72%,0)`);
    x.fillStyle = grad;
    x.fillRect(gx - inner * 0.035, beamTop, inner * 0.07, (cy - r) - beamTop);

    // The beast: a hexagon carrying the problem.
    const bx = S / 2, by = pad + inner * 0.34, br = inner * 0.235;
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * TAU;
      const px = bx + Math.cos(a) * br, py = by + Math.sin(a) * br;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath();
    x.fillStyle = 'rgba(10,18,34,0.92)';
    x.fill();
    x.lineWidth = inner * 0.028;
    x.strokeStyle = `hsla(${theme.hostile},90%,62%,0.95)`;
    x.shadowColor = `hsla(${theme.hostile},100%,60%,0.8)`;
    x.shadowBlur = inner * 0.1;
    x.stroke();
    x.shadowBlur = 0;

    // The maths is the subject, so it is the brightest thing in the icon.
    x.fillStyle = '#eaf6ff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `700 ${Math.round(br * 0.92)}px "JetBrains Mono", ui-monospace, monospace`;
    x.fillText('7×8', bx, by + br * 0.03);
    return c.toDataURL('image/png');
  }

  return {
    'icon-192.png': paint(192, false),
    'icon-512.png': paint(512, false),
    'icon-maskable-512.png': paint(512, true),
    'icon-1024.png': paint(1024, false),
  };
});

mkdirSync('assets/icons', { recursive: true });
for (const [name, data] of Object.entries(shots)) {
  writeFileSync(`assets/icons/${name}`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote', name);
}
await browser.close();
