// Drive every boss to death and report what happened.
const pw = await (async () => {
  for (const c of ['/opt/node22/lib/node_modules/playwright/index.mjs',
                   '/usr/lib/node_modules/playwright/index.mjs']) {
    try { return await import(c); } catch { /* next */ }
  }
  return await import('playwright');
})();
const { chromium } = pw;
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = '/home/user/MathBlast';
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.png':'image/png', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = join(ROOT, u === '/' ? 'index.html' : u);
  if (!existsSync(f) || !f.startsWith(ROOT)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${base}/?q=high`, { waitUntil: 'load' });
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.game), null, { timeout: 20000 });
await page.waitForTimeout(400);

const waves = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const out = [];
for (const wave of waves) {
  const r = await page.evaluate((w) => new Promise((resolve) => {
    const g = window.game;
    g.state = 'title';
    g._begin();
    g.wave = w - 1;
    g.beasts.length = 0;
    g._nextWave();
    const seen = { title: g.boss && g.boss.title, solves: 0, wrongs: 0, hurts: 0 };
    let frames = 0, phases = new Set(), remnant = null, ended = false;
    const startScore = g.score;
    const hurt0 = g.waveMisses;
    const tick = () => {
      for (let i = 0; i < 4; i++) {
        if (g.boss) phases.add(g.boss.phase);
        const t = g.beasts.find((b) => b.alive && !b.locked);
        if (t && frames % 12 === 0) {
          // Occasionally answer wrong on purpose, to exercise onWrong.
          const bad = seen.wrongs < 2 && frames > 90 && frames % 96 === 0;
          g.targetBeast = t;
          g._fire(bad ? '9999' : t.answerText);
          bad ? seen.wrongs++ : seen.solves++;
        }
        g.update(1 / 60);
        const io = g.orbs.list.find((o) => o.infinity);
        if (io && !remnant) remnant = io.glyph;
        frames++;
        if (g.wavePhase === 'interlude') ended = true;
      }
      if (ended || frames > 60 * 90 || g.state !== 'playing') {
        seen.hurts = g.waveMisses - hurt0;
        return resolve({ ...seen, wave: w, frames, ended,
          phases: [...phases], remnant, gain: g.score - startScore,
          state: g.state, cores: g.cores });
      }
      requestAnimationFrame(tick);
    };
    tick();
  }), wave);
  out.push(r);
  console.log(JSON.stringify(r));
}
console.log('ERRORS', errs.length ? errs.slice(0, 8) : 'none');
await browser.close();
server.close();
