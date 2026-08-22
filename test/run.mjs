// Browser-driven test suite. Starts the static server, drives the real game in
// headless Chromium and asserts on live game state.
//
//   npm test
//
// Playwright is not a project dependency -- the game itself has none. The suite
// resolves whatever Playwright the machine already has (the sandboxed dev image
// ships one globally) and skips with a clear message if there is none.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const PORT = Number(process.env.PORT) || 5273;
const BASE = `http://localhost:${PORT}`;
const require = createRequire(import.meta.url);

async function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.mjs',
    '/usr/lib/node_modules/playwright/index.mjs',
  ];
  for (const c of candidates) {
    try { return await import(c.startsWith('/') ? c : require.resolve(c)); } catch { /* next */ }
  }
  return null;
}

const results = [];
const check = (name, ok) => { results.push({ name, ok: Boolean(ok) }); };

async function main() {
  const pw = await loadPlaywright();
  if (!pw) {
    console.log('Playwright not found — skipping browser tests.');
    console.log('Install with: npm i -D playwright && npx playwright install chromium');
    process.exit(0);
  }

  const server = spawn(process.execPath, ['serve.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  // Wait for the server to answer.
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  const browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 740 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    // The webfont is a progressive enhancement; blocking it is not a failure.
    if (m.type() === 'error' && !/fonts\.g|ERR_CONNECTION/.test(m.text())) errs.push('console: ' + m.text());
  });

  await page.goto(`${BASE}/?q=high`, { waitUntil: 'load' });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  // --- helpers -----------------------------------------------------------
  const only = (expr) => page.evaluate(async (src) => {
    const M = await import('/src/entities/beasts/index.js');
    const g = window.game;
    g.beasts.length = 0; g.shots.length = 0; g.targetBeast = null;
    g.waveRemaining = 0; g.spawnTimer = 999; g.wavePhase = 'active';
    g.shockwaves.clear(); g.orbs.clear();
    g.beasts.push(eval(src));
  }, expr);
  const waitTarget = () => page.waitForFunction(() => window.game.targetBeast != null, null, { timeout: 6000 });
  const state = (fn) => page.evaluate(fn);
  const type = async (s) => {
    await page.evaluate(() => { window.game.input = ''; });
    for (const ch of s) await page.keyboard.press(ch === '/' ? 'Slash' : ch);
    await page.keyboard.press('Enter');
  };
  const blast = async () => {
    await page.waitForFunction(() => window.game.shockwaves.list.length > 0, null, { timeout: 3000 });
    return state(() => ({
      rings: window.game.shockwaves.list.length,
      rMax: Math.round(Math.max(...window.game.shockwaves.list.map((s) => s.rMax))),
      orbs: window.game.orbs.count,
    }));
  };

  // --- multiplication: impact pipeline -----------------------------------
  await only('new M.MultBeast(7, 8, 640, 240, 0)');
  await waitTarget();
  const before = await state(() => window.game.shield.intact);
  await type('56');
  const hit = await blast();
  check('correct answer spawns rings and orbs', hit.rings > 0 && hit.orbs > 0);
  await page.waitForTimeout(1800);
  check('orbs deposit into the shield', (await state(() => window.game.shield.intact)) > before);

  // --- magnitude scaling --------------------------------------------------
  await only('new M.MultBeast(2, 3, 400, 240, 0)');
  await waitTarget(); await type('6');
  const small = await blast();
  await page.waitForTimeout(2000);
  await only('new M.MultBeast(12, 12, 880, 240, 0)');
  await waitTarget(); await type('144');
  const big = await blast();
  check('bigger problems make bigger explosions',
        big.rings > small.rings && big.rMax > small.rMax * 1.4 && big.orbs > small.orbs);
  await page.waitForTimeout(2000);

  // --- splitting and primes ----------------------------------------------
  await only('new M.SplitBeast(48, 640, 220, 0)');
  await waitTarget(); await type('6');
  await page.waitForTimeout(700);
  const kids = await state(() => window.game.beasts.filter((b) => b.alive).map((b) => b.n).sort((a, b) => a - b));
  check('48 struck with 6 splits into 6 and 8', JSON.stringify(kids) === '[6,8]');

  await only('new M.SplitBeast(17, 640, 220, 0)');
  await waitTarget();
  check('a prime rejects a factor', (await state(() => window.game.targetBeast.accepts('4'))) === false);
  await type('17');
  await page.waitForTimeout(600);
  check('a prime dies when it is named', (await state(() => window.game.beasts.filter((b) => b.alive).length)) === 0);

  // --- every beast states its own task ------------------------------------
  // A bare number is not a question. This is the regression that made boulders
  // unplayable: they rendered "48" with no prompt, and the only instruction was
  // HUD text shown for the targeted beast alone.
  const prompts = await page.evaluate(async () => {
    const M = await import('/src/entities/beasts/index.js');
    return {
      mult: new M.MultBeast(7, 8, 0, 0, 0).promptText,
      composite: new M.SplitBeast(48, 0, 0, 0).promptText,
      prime: new M.SplitBeast(17, 0, 0, 0).promptText,
      voidling: new M.Voidling(6, 0, 0, 0).promptText,
      boss: new M.BossBeast(3, 7, 5, 0, 0, 0).promptText,
      fraction: new M.FractionBeast(3, 8, 0, 0, 0).promptText,
    };
  });
  check('every beast type states a task, not just a number',
        Object.values(prompts).every((p) => /[?=×]/.test(p) && !/^\d+$/.test(p)));
  check('boulders ask for a factor in words the rock shows itself',
        prompts.composite === '? × ? = 48' && prompts.prime === '? × ? = 17');

  // --- the lattice actually renders every cell ------------------------------
  // Regression: batching the cells into four fills for performance used a
  // roundRect helper that called beginPath(), so each cell discarded the
  // previous one and only four cells per beast were ever drawn. Logic tests
  // cannot see this -- it has to be counted in pixels.
  const lattice = await page.evaluate(async () => {
    const M = await import('/src/entities/beasts/index.js');
    const g = window.game;
    const count = (a, b) => {
      g.beasts.length = 0; g.waveRemaining = 0; g.spawnTimer = 999; g.waveBanner = 0;
      g.shockwaves.clear(); g.orbs.clear(); g.particles.clear();
      const beast = new M.MultBeast(a, b, 640, 300, 0);
      g.beasts.push(beast);
      g.draw();
      const PITCH = 15, CELL = 12;
      const x0 = beast.x - beast.w / 2, y0 = beast.y - beast.h / 2;
      // Calibrate against the dark shell just outside the grid.
      const bg = g.ctx.getImageData(Math.round(x0 - 5), Math.round(y0 - 5), 1, 1).data;
      const floor = bg[0] + bg[1] + bg[2] + 90;
      let lit = 0;
      for (let j = 0; j < b; j++) {
        for (let i = 0; i < a; i++) {
          const d = g.ctx.getImageData(Math.round(x0 + i * PITCH + CELL / 2),
                                       Math.round(y0 + j * PITCH + CELL / 2), 1, 1).data;
          if (d[0] + d[1] + d[2] > floor) lit++;
        }
      }
      return { expected: a * b, lit };
    };
    return { small: count(3, 3), mid: count(6, 7), big: count(12, 12) };
  });
  check('every lattice cell is drawn, not one per colour bucket',
        lattice.small.lit === 9 && lattice.mid.lit === 42 && lattice.big.lit === 144);

  // --- choosing which beast to solve ----------------------------------------
  await page.evaluate(async () => {
    const M = await import('/src/entities/beasts/index.js');
    const g = window.game;
    g.beasts.length = 0; g.shots.length = 0; g.targetBeast = null; g.manualTargetId = null;
    g.waveRemaining = 0; g.spawnTimer = 999;
    g.beasts.push(new M.MultBeast(6, 7, 260, 140, 0));
    g.beasts.push(new M.SplitBeast(48, 620, 250, 0));
    g.beasts.push(new M.MultBeast(9, 4, 880, 380, 0));
  });
  await page.waitForTimeout(350);
  const tAuto = await state(() => ({ x: Math.round(window.game.targetBeast.x),
                                     manual: window.game.manualTargetId != null }));
  check('auto-target picks the most dangerous beast', tAuto.x > 800 && !tAuto.manual);

  await page.keyboard.press('BracketLeft');
  await page.waitForTimeout(150);
  const tLeft = await state(() => ({ x: Math.round(window.game.targetBeast.x),
                                     manual: window.game.manualTargetId != null }));
  check('[ steps the target left and locks it', tLeft.x < 700 && tLeft.manual);

  await page.waitForTimeout(900);
  const tHeld = await state(() => Math.round(window.game.targetBeast.x));
  check('a manual target is not stolen back by auto-targeting',
        Math.abs(tHeld - tLeft.x) < 40);

  await page.keyboard.press('BracketRight');
  await page.waitForTimeout(150);
  check('] steps the target back right',
        (await state(() => Math.round(window.game.targetBeast.x))) > 800 ||
        (await state(() => Math.round(window.game.targetBeast.x))) < 400);

  // Firing releases the lock so the turret resumes defending.
  await page.evaluate(() => { window.game.input = ''; });
  await type(await state(() => window.game.targetBeast.answerText));
  await page.waitForTimeout(900);
  check('firing releases the manual lock back to auto',
        (await state(() => window.game.manualTargetId)) === null);

  // The click-to-target inverse must survive a zoomed, shaken camera.
  const inv = await state(() => {
    const g = window.game, w = 1280, h = 720, c = g.camera;
    c.zoom = 1.14; c.shakeX = 7; c.shakeY = -4; c.shakeRot = 0.02;
    const pt = { x: 421, y: 233 };
    const cos = Math.cos(c.shakeRot), sin = Math.sin(c.shakeRot);
    let x = (pt.x - w / 2 + c.shakeX - c.x) * c.zoom;
    let y = (pt.y - h / 2 + c.shakeY - c.y) * c.zoom;
    const back = c.screenToWorld(x * cos - y * sin + w / 2, x * sin + y * cos + h / 2, w, h);
    c.zoom = 1; c.shakeX = 0; c.shakeY = 0; c.shakeRot = 0;
    return Math.max(Math.abs(back.x - pt.x), Math.abs(back.y - pt.y));
  });
  check('click-to-target maps correctly under zoom and shake', inv < 0.01);

  // --- discovering a prime is free -----------------------------------------
  await only('new M.SplitBeast(17, 560, 260, 0)');
  await waitTarget();
  const preP = await state(() => {
    const g = window.game;
    g.combo = 6;
    return { combo: g.combo, intact: g.shield.intact, attempts: g.attempts };
  });
  await type('4');
  await page.waitForTimeout(700);
  const postP = await state(() => {
    const g = window.game;
    const b = g.beasts.find((x) => x.alive);
    return { combo: g.combo, intact: g.shield.intact, attempts: g.attempts,
             revealed: Boolean(b && b.revealed), prompt: b && b.promptText };
  });
  check('factoring a prime costs nothing and reveals it',
        postP.combo === preP.combo && postP.intact === preP.intact &&
        postP.attempts === preP.attempts && postP.revealed &&
        postP.prompt === '17 is PRIME');
  await type('17');
  await page.waitForTimeout(600);
  check('a revealed prime still dies when named',
        (await state(() => window.game.beasts.filter((b) => b.alive).length)) === 0);

  // --- a boulder accepts what its label asks for ----------------------------
  // The rock reads "? × ? = 48", so both halves of that question have to work:
  // one factor, or the pair. A pair is judged on its product.
  const ans = await page.evaluate(async () => {
    const M = await import('/src/entities/beasts/index.js');
    const b = new M.SplitBeast(48, 0, 0, 0);
    const pr = new M.SplitBeast(17, 0, 0, 0);
    const mu = new M.MultBeast(7, 8, 0, 0, 0);
    return {
      one: b.accepts('12') && b.accepts('4') && b.accepts('6'),
      pair: b.accepts('12×4') && b.accepts('4×12') && b.accepts('6×8'),
      badPair: b.accepts('12×9') || b.accepts('1×48') || b.accepts('7×7'),
      badOne: b.accepts('5') || b.accepts('1') || b.accepts('48'),
      primePair: pr.accepts('4×5'),
      primeNamed: pr.accepts('17'),
      // parseInt("56×1") is 56, which used to pass as the product of 7x8.
      looseParse: mu.accepts('56×1') || mu.accepts('56x'),
      exact: mu.accepts('56'),
    };
  });
  check('a boulder takes one factor or the whole pair', ans.one && ans.pair);
  check('a wrong pair is rejected on its product', !ans.badPair && !ans.badOne);
  check('a prime takes no pair, only its own name', !ans.primePair && ans.primeNamed);
  check('trailing junk no longer parses as a right answer', !ans.looseParse && ans.exact);

  // Typing the pair through the keyboard, x for the sign.
  await only('new M.SplitBeast(48, 620, 250, 0)');
  await waitTarget();
  await page.evaluate(() => { window.game.input = ''; });
  for (const k of ['1', '2', 'x', '4']) await page.keyboard.press(k);
  check('x types the multiplication sign',
        (await state(() => window.game.input)) === '12×4');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const pairKids = await state(() =>
    window.game.beasts.filter((b) => b.alive).map((b) => b.n).sort((a, b) => a - b));
  check('a pair answer splits the rock into exactly those two factors',
        JSON.stringify(pairKids) === '[4,12]');

  // --- fractions ----------------------------------------------------------
  await only('new M.FractionBeast(2, 8, 640, 230, 0)');
  await waitTarget();
  const eq = await state(() => {
    const b = window.game.targetBeast;
    return { low: b.accepts('1/4'), raw: b.accepts('2/8'), bad: b.accepts('1/3') };
  });
  check('equivalent fractions are accepted', eq.low && eq.raw && !eq.bad);
  await type('2/8');
  await page.waitForTimeout(600);

  // --- voidlings ----------------------------------------------------------
  await only('new M.Voidling(7, 640, 600, 40)');
  await waitTarget();
  const y0 = await state(() => window.game.beasts[0].y);
  await page.waitForTimeout(500);
  check('voidlings rise', (await state(() => window.game.beasts[0].y)) < y0);
  await type('7');
  await page.waitForTimeout(600);
  check('a voidling annihilates on its inverse',
        (await state(() => window.game.beasts.filter((b) => b.alive).length)) === 0);

  // --- boss ---------------------------------------------------------------
  await only('new M.BossBeast(3, 7, 5, 640, 250, 0)');
  const answers = [];
  for (let i = 0; i < 3; i++) {
    await waitTarget();
    answers.push(await state(() => window.game.targetBeast.answerText));
    await type(answers[i]);
    await page.waitForTimeout(700);
  }
  check('boss solves in three steps (22-7, /3, verify)', JSON.stringify(answers) === '["15","5","22"]');
  check('boss dies after its last stage',
        (await state(() => window.game.beasts.filter((b) => b.alive).length)) === 0);

  // --- overcharge ---------------------------------------------------------
  await page.evaluate(async () => {
    const M = await import('/src/entities/beasts/index.js');
    const g = window.game;
    g.beasts.length = 0;
    for (let i = 0; i < 3; i++) g.beasts.push(new M.MultBeast(3, 3, 640 + (i - 1) * 40, 150 + i * 90, 0));
    g.beasts.push(new M.MultBeast(4, 4, 200, 300, 0));
    g.overcharge = 1; g.chargeReady = true;
  });
  await page.waitForTimeout(120);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const beam = await state(() => ({
    survivors: window.game.beasts.filter((b) => b.alive).length,
    charge: window.game.overcharge,
  }));
  check('overcharge clears its column and nothing else', beam.survivors === 1 && beam.charge === 0);
  await page.waitForTimeout(2000);

  // --- landings -----------------------------------------------------------
  await only('new M.MultBeast(3, 3, 640, 300, 0)');
  await page.evaluate(() => {
    const g = window.game, b = g.beasts[0];
    for (const p of g.shield.plates) if (Math.abs(p.x - b.x) < 46) p.integrity = 1;
    g._t = { cores: g.cores, scars: g.shield.scars.length };
    b.y = 5000;
  });
  await page.waitForTimeout(700);
  const abs = await state(() => ({ was: window.game._t, cores: window.game.cores, scars: window.game.shield.scars.length }));
  check('an intact dome absorbs a landing', abs.cores === abs.was.cores && abs.scars === abs.was.scars);

  await only('new M.MultBeast(3, 3, 400, 300, 0)');
  await page.evaluate(() => {
    const g = window.game, b = g.beasts[0];
    for (const p of g.shield.plates) if (Math.abs(p.x - b.x) < 80) p.integrity = 0;
    g._t = { cores: g.cores, scars: g.shield.scars.length, dark: g.shield.darkGroups };
    b.y = 5000;
  });
  await page.waitForTimeout(800);
  const br = await state(() => ({
    was: window.game._t, cores: window.game.cores,
    scars: window.game.shield.scars.length, dark: window.game.shield.darkGroups,
  }));
  check('a bare dome costs a core and scars the surface',
        br.cores === br.was.cores - 1 && br.scars === br.was.scars + 1);
  check('losing a core darkens the city lights', br.dark > br.was.dark);

  // --- adaptive music -----------------------------------------------------
  const a0 = await state(() => ({
    bpm: window.game.audio.bpm, verb: !!window.game.audio.verb,
    pan: !!window.game.audio.ctx.createStereoPanner,
  }));
  check('reverb and stereo panning are wired', a0.verb && a0.pan);
  const bright = await state(() => {
    const g = window.game;
    for (let i = 0; i < 40; i++) { g.rollingAcc = g.rollingAcc * 0.82 + 0.18; g.audio.setAccuracy(g.rollingAcc); }
    g.audio.setWave(9);
    return { bpm: g.audio.bpm, mode: g.audio.modeBlend, tones: g.audio._chordTones(0) };
  });
  check('tempo rises with the wave', bright.bpm > a0.bpm);
  check('high accuracy brightens the mode to a major triad',
        bright.mode > 3 && JSON.stringify(bright.tones) === '[0,4,7]');
  const dark = await state(() => {
    const g = window.game;
    for (let i = 0; i < 40; i++) { g.rollingAcc *= 0.82; g.audio.setAccuracy(g.rollingAcc); }
    return g.audio.modeBlend;
  });
  check('misses darken the mode again', dark < 1);

  // --- accessibility ------------------------------------------------------
  await page.keyboard.press('c');
  await page.waitForTimeout(100);
  const cs = await state(async () => {
    const { theme } = await import('/src/theme.js');
    return { on: theme.colorSafe, friendly: theme.friendly, hostile: theme.hostile };
  });
  check('colour-safe palette splits blue vs yellow',
        cs.on && cs.friendly > 200 && cs.hostile < 60);
  await page.keyboard.press('c');

  await only('new M.MultBeast(12, 12, 640, 250, 0)');
  await page.keyboard.press('r');
  await page.waitForTimeout(80);
  const rmShake = await state(() => {
    const g = window.game;
    g.camera.trauma = 0;
    const b = g.beasts[0]; b.locked = true; g._destroy(b, 1.5);
    return g.camera.trauma;
  });
  await page.keyboard.press('r');
  await only('new M.MultBeast(12, 12, 640, 250, 0)');
  const fullShake = await state(() => {
    const g = window.game;
    g.camera.trauma = 0;
    const b = g.beasts[0]; b.locked = true; g._destroy(b, 1.5);
    return g.camera.trauma;
  });
  check('reduced motion cuts screen shake', rmShake > 0 && rmShake < fullShake * 0.2);

  // --- multiple choice ----------------------------------------------------
  await only('new M.MultBeast(6, 7, 640, 240, 0)');
  await waitTarget();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const ch = await state(() => ({
    mode: window.game.inputMode,
    n: new Set(window.game.choices).size,
    has: window.game.choices.includes('42'),
  }));
  check('choice mode offers four distinct options including the answer',
        ch.mode === 'choose' && ch.n === 4 && ch.has);
  await page.evaluate(() => { window.game.choiceIndex = window.game.choices.indexOf('42'); });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  check('firing a chosen answer resolves the beast',
        (await state(() => window.game.beasts.filter((b) => b.alive).length)) === 0);
  await page.keyboard.press('Tab');

  // --- game over and restart ---------------------------------------------
  await page.evaluate(() => { window.game.cores = 1; });
  await only('new M.MultBeast(3, 3, 900, 300, 0)');
  await page.evaluate(() => {
    const g = window.game, b = g.beasts[0];
    for (const p of g.shield.plates) if (Math.abs(p.x - b.x) < 80) p.integrity = 0;
    b.y = 5000;
  });
  await page.waitForTimeout(1400);
  check('game over at zero cores', (await state(() => window.game.state)) === 'gameover');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const rs = await state(() => ({
    state: window.game.state, score: window.game.score, cores: window.game.cores,
    scars: window.game.shield.scars.length, dark: window.game.shield.darkGroups,
  }));
  check('restart clears score, scars and darkened cities',
        rs.state === 'playing' && rs.score === 0 && rs.cores === 3 && rs.scars === 0 && rs.dark === 0);

  // --- a real run, driven end to end --------------------------------------
  const soak = await page.evaluate(() => new Promise((resolve) => {
    const g = window.game;
    g.wave = 4; g.waveRemaining = 0; g.beasts.length = 0;
    const kinds = new Set();
    const bossStages = new Set();
    const tick = setInterval(() => {
      if (g.state !== 'playing') return done();
      const t = g.targetBeast;
      if (!t) return;
      kinds.add(t.constructor.name);
      if (t.isBoss) bossStages.add(t.stage);
      g._fire(t.answerText);
      if (g.wave >= 7) return done();
    }, 130);
    function done() {
      clearInterval(tick);
      resolve({ kinds: [...kinds], bossStages: [...bossStages], wave: g.wave, state: g.state });
    }
    setTimeout(done, 70000);
  }));
  check('a real run reaches wave 7 through every beast type',
        soak.wave >= 7 && soak.kinds.length >= 4 && soak.bossStages.length === 3);

  check('no runtime errors anywhere in the suite', errs.length === 0);
  if (errs.length) console.log(errs.join('\n'));

  await browser.close();
  stop();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
