// Play Arcade and every Practice track from wave one to a win, headlessly.
//
// The unit suite can tell you a plan has the right shape. It cannot tell you a
// fifty-wave run actually reaches wave fifty, that the clock ran, that the
// concepts arrived when the gates said they would, or that the victory screen
// is reachable at all. This drives the real game loop and reports what came
// out the other end.

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const pw = await (async () => {
  for (const c of ['/opt/node22/lib/node_modules/playwright/index.mjs',
                   '/usr/lib/node_modules/playwright/index.mjs']) {
    try { return await import(c); } catch { /* next */ }
  }
  return await import('playwright');
})();
const { chromium } = pw;

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
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
page.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.g|ERR_CONNECTION/.test(m.text())) errs.push(m.text());
});
await page.goto(`${base}/?q=high`, { waitUntil: 'load' });
await page.evaluate(() => { try { localStorage.clear(); } catch { /* private mode */ } });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.game), null, { timeout: 20000 });
await page.waitForTimeout(400);

// One full run. Answers everything correctly and instantly, so what is being
// measured is whether the run can be completed at all -- not whether a person
// could complete it.
//
// Driven synchronously rather than through rAF. A fifty-wave run is around an
// hour of simulated time -- roughly 60,000 frames even answering perfectly --
// and yielding to the event loop every few frames turns that into minutes of
// wall clock per run for no benefit; nothing here needs to paint.
const run = (mode, track) => page.evaluate(([m, tr]) => {
  const g = window.game;
  g.state = 'title';
  g.mode = m;
  if (tr) { g.trackId = tr; g.trackIndex = 0; }
  g._begin();
  const concepts = new Set();
  const seenAt = {};
  const CAP = 60 * 60 * 45;
  let f = 0;
  for (; f < CAP && g.state === 'playing'; f++) {
    // Cores are pinned: this asks whether fifty waves can be reached and won,
    // not whether a perfect player would survive them.
    g.cores = 99;
    const t = g.beasts.find((b) => b.alive && !b.locked);
    if (t) {
      if (!seenAt[t.concept]) seenAt[t.concept] = g.wave;
      concepts.add(t.concept);
      g.targetBeast = t;
      g._fire(t.answerText);
    }
    g.update(1 / 60);
  }
  return {
    mode: m, track: tr || null, state: g.state, wave: g.wave, won: g.won,
    seconds: Math.round(g.runTime), frames: f,
    concepts: [...concepts].sort(), seenAt,
    place: g.lastRun ? g.lastRun.place : 0,
    label: g.lastRun ? g.lastRun.label : '',
  };
}, [mode, track]);

const out = [];
out.push(await run('arcade'));
for (const t of ['add', 'mult', 'fraction', 'percent', 'integer']) {
  out.push(await run('practice', t));
}
for (const r of out) {
  const tag = `${r.mode}${r.track ? ':' + r.track : ''}`.padEnd(18);
  console.log(`${tag} ${r.state.padEnd(8)} wave ${String(r.wave).padStart(2)} won=${r.won} ` +
              `clock=${r.seconds}s place=${r.place} concepts=${r.concepts.length} ` +
              `[${r.concepts.join(',')}]`);
}
// Arcade's gate schedule, as it actually played out.
const arc = out[0];
console.log('arcade first seen:', JSON.stringify(arc.seenAt));
console.log('ERRORS', errs.length ? errs.slice(0, 6) : 'none');
await browser.close();
server.close();
