// Browser-driven test suite. Starts the static server, drives the real game in
// headless Chromium and asserts on live game state.
//
//   npm test
//
// Playwright is not a project dependency -- the game itself has none. The suite
// resolves whatever Playwright the machine already has (the sandboxed dev image
// ships one globally) and skips with a clear message if there is none.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { assets, version } from '../tools/gen-sw.mjs';

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

  // Start from a clean store so the profile flow is exercised from scratch and
  // the run is deterministic.
  await page.goto(`${BASE}/?q=high`, { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* private mode */ } });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);

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
  const nameIt = async (name) => {
    await page.fill('#nameField', name);
    await page.waitForTimeout(120);
    await page.evaluate(() => document.getElementById('nameField')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await page.waitForTimeout(300);
  };

  const blast = async () => {
    await page.waitForFunction(() => window.game.shockwaves.list.length > 0, null, { timeout: 3000 });
    return state(() => ({
      rings: window.game.shockwaves.list.length,
      rMax: Math.round(Math.max(...window.game.shockwaves.list.map((s) => s.rMax))),
      orbs: window.game.orbs.count,
    }));
  };

  // --- profiles -------------------------------------------------------------
  check('a first run asks who is playing',
        (await state(() => window.game.state)) === 'profile');
  await page.keyboard.press('Enter');            // + NEW PLAYER
  await page.waitForTimeout(250);
  check('choosing new player opens name entry', await state(() => window.game.naming));

  await nameIt('  Ada  Lovelace!! ');
  const made = await state(() => ({
    state: window.game.state,
    names: window.game.profiles.list.map((p) => p.name),
    skillKey: window.game.skill.storeKey,
  }));
  check('a name is cleaned and the profile is created',
        made.state === 'title' && made.names[0] === 'Ada Lovelace');
  check('each profile gets its own fact history',
        /mathblast\.skill\.v2\./.test(made.skillKey));

  const dupe = await state(() => {
    const before = window.game.profiles.list.length;
    const r = window.game.profiles.create('ada lovelace');
    return { rejected: r === null, same: window.game.profiles.list.length === before };
  });
  check('a duplicate name is refused', dupe.rejected && dupe.same);

  const empties = await state(() =>
    ['', '   ', '!!!', '\u0000'].every((n) => window.game.profiles.create(n) === null));
  check('an empty or unprintable name is refused', empties);

  await page.keyboard.press('Enter');            // begin the run
  await page.waitForTimeout(600);

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
      boss: new M.BossBeast([{prompt:'3x + 7 = 22',hint:'isolate: 22 − 7 =',answer:'15'},{prompt:'3x = 15',hint:'solve: 15 ÷ 3 =',answer:'5'},{prompt:'x = 5',hint:'verify: 3 × 5 + 7 =',answer:'22'}], 0, 0, 0).promptText,
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
    return {
      low: b.accepts('1/4'), raw: b.accepts('2/8'), bad: b.accepts('1/3'),
      // The label reads "? / 8", so a counted numerator has to work too --
      // it did not, and no answer a player typed would land.
      bare: b.accepts('2'), label: b.promptText, denom: b.accepts('8'),
    };
  });
  check('equivalent fractions are accepted', eq.low && eq.raw && !eq.bad);
  check('the crystal takes the numerator its label asks for',
        eq.bare && eq.label === '? / 8' && !eq.denom);
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
  await only(`new M.BossBeast([{prompt:'3x + 7 = 22',hint:'isolate: 22 − 7 =',answer:'15'},{prompt:'3x = 15',hint:'solve: 15 ÷ 3 =',answer:'5'},{prompt:'x = 5',hint:'verify: 3 × 5 + 7 =',answer:'22'}], 640, 250, 0)`);
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

  // --- the instructions screen ---------------------------------------------
  await page.keyboard.press('h');
  await page.waitForTimeout(200);
  check('H opens the instructions', await state(() => window.game.help));

  const frozen = await page.evaluate(() => new Promise((res) => {
    const g = window.game;
    const t0 = g.time;
    const y0 = g.beasts[0] ? g.beasts[0].y : null;
    setTimeout(() => res({
      dt: +(g.time - t0).toFixed(3),
      dy: y0 === null ? 0 : +(g.beasts[0] ? g.beasts[0].y - y0 : 0).toFixed(2),
    }), 700);
  }));
  check('the game holds still while the instructions are open',
        frozen.dt === 0 && frozen.dy === 0);

  await page.keyboard.press('7');
  await page.keyboard.press('7');
  check('keys do not leak into the answer box behind the instructions',
        (await state(() => window.game.input)) === '');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('ESC closes the instructions', !(await state(() => window.game.help)));

  // --- difficulty tiers -------------------------------------------------------
  // The single most valuable check here: every problem the generators can
  // produce must accept its own stated answer. It sweeps all three tiers,
  // every wave, every beast kind and every boss step.
  const consistency = await state(async () => {
    const M = await import('/src/entities/beasts/index.js');
    const { BASE_TIERS: TIERS } = await import('/src/difficulty.js');
    const g = window.game;
    const bad = [];
    for (const tier of TIERS) {
      for (let wave = 1; wave <= 10; wave++) {
        for (let i = 0; i < 50; i++) {
          const b = M.makeBeast(tier, wave, g.skill, 640, 100, 40);
          if (!b.accepts(b.answerText)) {
            bad.push(`${tier.id} ${b.constructor.name} "${b.promptText}" -> ${b.answerText}`);
          }
        }
        const boss = M.makeBoss(tier, wave, 640, 100, 40);
        for (let st = 0; st < boss.stages; st++) {
          if (!boss.accepts(boss.answerText)) {
            bad.push(`${tier.id} boss "${boss.promptText}" -> ${boss.answerText}`);
          }
          boss.resolve();
        }
      }
    }
    return { count: bad.length, sample: bad.slice(0, 4) };
  });
  check('every generated problem accepts its own answer', consistency.count === 0);
  if (consistency.count) console.log(consistency.sample.join('\n'));

  const kinds = await state(async () => {
    const M = await import('/src/entities/beasts/index.js');
    const { tierById } = await import('/src/difficulty.js');
    const g = window.game;
    const sweep = (id, lastWave = 9) => {
      const tier = tierById(id);
      const seen = new Set();
      let maxMult = 0, maxArith = 0, maxDivPart = 0, basics = 0, total = 0;
      for (let wave = 1; wave <= lastWave; wave++) {
        for (let i = 0; i < 300; i++) {
          const b = M.makeBeast(tier, wave, g.skill, 640, 100, 40);
          const k = b.constructor.name;
          seen.add(k);
          total++;
          if (k === 'MultBeast') maxMult = Math.max(maxMult, b.a, b.b);
          // What a player actually reasons about. A division's dividend is a
          // product of two single digits, so 81 / 9 is single-digit work even
          // though 81 is not a single-digit number -- the parts are what count.
          if (k === 'DivBeast') maxDivPart = Math.max(maxDivPart, b.b, b.value);
          if (k === 'ArithBeast') { maxArith = Math.max(maxArith, b.a, b.b); basics++; }
        }
      }
      return { kinds: [...seen].sort(), maxMult, maxArith, maxDivPart,
               basicShare: basics / total };
    };
    return {
      easy: sweep('easy', 20), medium: sweep('medium'), hard: sweep('hard'),
    };
  });
  // Easy is single digit, everywhere, however long the run goes. Its addition
  // used to open on `23 + 19` because the operand cap was `20 + wave * 6` for
  // every tier, so the sweep runs to wave 20 rather than stopping at 9.
  check('easy stays single digit: adding, taking away, times and sharing',
        JSON.stringify(kinds.easy.kinds) === '["ArithBeast","DivBeast","MultBeast"]' &&
        kinds.easy.maxMult <= 9 && kinds.easy.maxArith <= 9 && kinds.easy.maxDivPart <= 9);
  // "focused mostly on addition and subtraction" -- so they have to stay the
  // plurality of what spawns, not get crowded out as the roster widens.
  check('adding and taking away stay the bulk of easy', kinds.easy.basicShare > 0.5);
  // Medium is where the numbers get bigger rather than the ideas.
  check('medium brings in two-digit adding and taking away',
        kinds.medium.kinds.includes('ArithBeast') && kinds.medium.maxArith > 9);
  check('hard sends grade-7 work: integers, fraction sums, percents, powers',
        ['FracOpBeast', 'IntegerBeast', 'PercentBeast', 'PowerBeast']
          .every((k) => kinds.hard.kinds.includes(k)));
  check('medium keeps the factors-and-fractions set',
        kinds.medium.kinds.includes('SplitBeast') &&
        kinds.medium.kinds.includes('FractionBeast') &&
        !kinds.medium.kinds.includes('PercentBeast'));

  const bosses = await state(async () => {
    const M = await import('/src/entities/beasts/index.js');
    const { BASE_TIERS: TIERS } = await import('/src/difficulty.js');
    const out = {};
    for (const tier of TIERS) {
      const b = M.makeBoss(tier, 6, 0, 0, 0);
      out[tier.id] = b.stages;
    }
    return out;
  });
  check('each tier poses its own kind of equation',
        bosses.easy === 2 && bosses.medium === 3 && bosses.hard === 3);

  // Signed answers need the minus key and must round-trip through it.
  const signed = await state(async () => {
    const { IntegerBeast } = await import('/src/entities/beasts/integer.js');
    const b = new IntegerBeast(-8, 7, 'x', 0, 0, 0);
    return {
      value: b.value,
      ascii: b.accepts('-56'),
      glyph: b.accepts('\u221256'),      // what the − key inserts
      unsigned: b.accepts('56'),
      prompt: b.promptText,
    };
  });
  check('a negative answer is accepted from the minus key, and only when signed',
        signed.value === -56 && signed.ascii && signed.glyph && !signed.unsigned);

  // Sector banding: the point is that it is visible, so assert it moves.
  const bands = await state(async () => {
    const { setThemeWave, theme } = await import('/src/theme.js');
    const g = window.game;
    const rows = [];
    for (const w of [1, 4, 7, 10]) {
      setThemeWave(w);
      g.audio.setWave(w);
      rows.push({ name: theme.bandName, env: theme.env, bpm: g.audio.bpm, band: g.audio.band });
    }
    setThemeWave(1);
    return rows;
  });
  check('sectors are visibly distinct, not a slow smear',
        new Set(bands.map((b) => b.name)).size === 4 &&
        bands[3].env - bands[0].env > 90 &&
        bands[3].bpm - bands[0].bpm >= 30 &&
        bands.map((b) => b.band).join() === '0,1,2,3');

  // The arrangement, not just the tempo, has to change with the sector --
  // "no noticeable difference as waves increased" was the report that prompted
  // this, and a BPM number alone does not fix it.
  const arrangement = await state(() => {
    const a = window.game.audio;
    const rows = [];
    for (const band of [0, 1, 2, 3]) {
      a.setWave(band * 3 + 1);
      let hookNotes = 0;
      const real = a.ctx.createOscillator.bind(a.ctx);
      a.ctx.createOscillator = () => { hookNotes++; return real(); };
      for (let s = 0; s < 16; s++) a._hook(0, a.ctx.currentTime + 8 + s * 0.01, s);
      a.ctx.createOscillator = real;
      // Count real drum onsets over a four-bar phrase by wrapping the voices,
      // rather than reimplementing the pattern logic in the test.
      const VOICES = ['kick', 'snare', 'hat', 'tom', 'crash', 'clap'];
      const hits = {};
      const orig = {};
      for (const v of VOICES) {
        hits[v] = 0;
        orig[v] = a['_' + v];
        a['_' + v] = () => { hits[v]++; };
      }
      const perBar = [];
      let seen = 0;
      for (let bar = 0; bar < 4; bar++) {
        for (let s = 0; s < 16; s++) a._drums(s, 0, bar);
        const now = VOICES.reduce((n, v) => n + hits[v], 0);
        perBar.push(now - seen);
        seen = now;
      }
      for (const v of VOICES) a['_' + v] = orig[v];
      rows.push({
        bpm: a.bpm, pump: a.pumpAmount, hook: hookNotes / 2,
        onsets: seen, perBar, tom: hits.tom, crash: hits.crash,
      });
    }
    a.setWave(1);
    return rows;
  });
  const rising = (key) => arrangement.every((r, i) => i === 0 || r[key] >= arrangement[i - 1][key]);
  check('tempo, pump, hook and percussion all build with the sector',
        rising('bpm') && rising('pump') && rising('hook') && rising('onsets') &&
        arrangement[0].hook === 0 && arrangement[3].hook >= 10 &&
        arrangement[3].onsets >= arrangement[0].onsets * 3 &&
        arrangement[3].bpm - arrangement[0].bpm >= 30);

  // "The drum sounds dumb" was a loop that never varied: the same sixteen
  // steps, at the same velocity, for the whole game. Every sector past the
  // first now closes its four-bar phrase with a tom fill and opens the next
  // with a crash, so the bars are not interchangeable.
  check('the kit plays phrases, not one bar on repeat',
        arrangement[0].tom === 0 && arrangement[0].crash === 0 &&
        [1, 2, 3].every((b) => arrangement[b].tom > 0 && arrangement[b].crash === 1 &&
                               arrangement[b].perBar[3] !== arrangement[b].perBar[2] &&
                               arrangement[b].perBar[1] === arrangement[b].perBar[2]));

  // The kit also used to wait for danger > 0.62 in every sector, which meant
  // most of a run had no percussion at all. Probe the real gate by recording
  // what setDanger actually asks the drum layer for.
  const drumGate = await state(() => {
    const a = window.game.audio;
    const param = a.layerGain.drums.gain;
    const real = param.setTargetAtTime.bind(param);
    let target = 0;
    param.setTargetAtTime = (v, t, c) => { target = v; return real(v, t, c); };
    const gates = [];
    for (const band of [0, 1, 2, 3]) {
      a.silentUntil = 0;
      a.setWave(band * 3 + 1);
      let gate = 1;
      for (let d = 0; d <= 1.0001; d += 0.02) {
        a.setDanger(d);
        if (target > 0.001) { gate = +d.toFixed(2); break; }
      }
      gates.push(gate);
    }
    param.setTargetAtTime = real;
    a.setWave(1);
    a.setDanger(0);
    return gates;
  });
  check('the drums arrive earlier every sector',
        drumGate.every((g, i) => i === 0 || g < drumGate[i - 1]) && drumGate[3] < 0.25);

  // The wave transition, rendered offline and measured. Two things have gone
  // wrong here before and neither is visible in the source: an exponential gain
  // ramp is a factor of thousands, so it stays inaudible until the last tenth
  // and lands as a zip rather than a rise; and the riser that replaced it was
  // nearly three times louder than the loudest tenth of ordinary play, which is
  // what "the sound aesthetic doesn't work with the game" turned out to mean.
  // Both need a reference to catch, so the suite renders gameplay too.
  const build = await state(async () => {
    const { Audio } = await import('/src/audio.js');
    const SR = 44100;
    const off = new OfflineAudioContext(1, SR * 5, SR);
    const a = new Audio();
    const realAC = window.AudioContext;
    window.AudioContext = function () { return off; };
    a.start();
    window.AudioContext = realAC;
    clearInterval(a.timer);
    a.setWave(4);
    const until = a.buildUp(1.8);

    const buf = await off.startRendering();
    const d = buf.getChannelData(0);
    const frame = Math.floor(SR * 0.01);
    const env = [];
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let f = 0; f * frame < d.length; f++) {
      let sum = 0;
      for (let i = f * frame; i < Math.min((f + 1) * frame, d.length); i++) sum += d[i] * d[i];
      env.push(Math.sqrt(sum / frame));
    }
    const at = (t) => Math.floor(t / 0.01);
    const curve = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((f) => env[at(until * f)]);
    return {
      until,
      peak,
      curve,
      rises: curve.every((v, i) => i === 0 || v >= curve[i - 1] * 0.85),
      // The swell must be audible early, not silent until the end.
      audibleEarly: curve[1] > curve[5] * 0.1,
      loudestAt: env.indexOf(Math.max(...env)) * 0.01,
      maxRms: Math.max(...env),
    };
  });
  check('the wave build swells instead of spiking at the end',
        build.rises && build.audibleEarly && !(build.peak > 1));
  check('the build lands on its arrival, and the arrival is its loudest moment',
        build.until > 1.5 && Math.abs(build.loudestAt - build.until) < 0.15);

  // How loud ordinary play is, measured the same way, so the transition has
  // something to be quieter than.
  const play = await state(async () => {
    const { Audio } = await import('/src/audio.js');
    const SR = 44100;
    const off = new OfflineAudioContext(1, SR * 5, SR);
    const a = new Audio();
    const realAC = window.AudioContext;
    window.AudioContext = function () { return off; };
    a.start();
    window.AudioContext = realAC;
    clearInterval(a.timer);
    a.setWave(4);
    a.silentUntil = 0;
    // The mix at full danger: every stem up, two bars, and a combo hit.
    const full = { pad: 0.5, bass: 0.55, arp: 0.34, drums: 0.6, lead: 0.26 };
    for (const k in a.layerGain) a.layerGain[k].gain.value = full[k];
    for (let s = 0; s < 32; s++) a._playStep(s, 0.05 + s * a.stepDur);
    a.correct(3, 640, 1);

    const d = (await off.startRendering()).getChannelData(0);
    const frame = Math.floor(SR * 0.01);
    const env = [];
    for (let f = 0; (f + 1) * frame <= d.length; f++) {
      let sum = 0;
      for (let i = f * frame; i < (f + 1) * frame; i++) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / frame);
      if (rms > 0) env.push(rms);
    }
    env.sort((x, y) => x - y);
    return { p90: env[Math.floor(env.length * 0.9)] };
  });
  check('the wave transition sits inside the mix rather than over it',
        build.maxRms < play.p90 && build.maxRms > play.p90 * 0.4);

  // --- scores and profile records -------------------------------------------
  const board = await state(async () => {
    // `window.__scoresMod` never existed; the old destructure silently produced
    // undefined and nothing used it.
    const { Scores } = await import('/src/profiles.js');
    const s = window.game.scores;
    s.list = [];
    const place = [];
    place.push(s.add({ name: 'A', score: 100, wave: 2, accuracy: 90, combo: 3 }));
    place.push(s.add({ name: 'B', score: 300, wave: 4, accuracy: 95, combo: 9 }));
    place.push(s.add({ name: 'C', score: 200, wave: 3, accuracy: 80, combo: 5 }));
    const zero = s.add({ name: 'D', score: 0, wave: 1, accuracy: 0, combo: 0 });
    // Thirty more, so the cap is exercised from above rather than reached.
    for (let i = 0; i < 30; i++) s.add({ name: `X${i}`, score: 10 + i, wave: 1, accuracy: 50, combo: 1 });
    // A run good enough for the back half of the table still gets a placing --
    // a table of ten would have thrown this away.
    const deep = s.add({ name: 'DEEP', score: 25, wave: 2, accuracy: 70, combo: 2 });
    return {
      order: s.list.slice(0, 3).map((r) => r.name),
      places: place, zero, capped: s.list.length, best: s.best, deep,
      // Reloading must not silently trim the table back down.
      reloaded: new Scores().list.length,
      sorted: s.list.every((r, i) => i === 0 || s.list[i - 1].score >= r.score),
    };
  });
  check('the score table sorts by score and reports a placing',
        JSON.stringify(board.order) === '["B","C","A"]' && board.places[1] === 1 && board.best === 300);
  check('a zero score never takes a slot', board.zero === 0);
  check('the score table holds twenty and stays sorted',
        board.capped === 20 && board.reloaded === 20 && board.sorted);
  check('a run that only reaches the back half still places',
        board.deep >= 11 && board.deep <= 20);

  // Twenty rows do not fit the gap the title screen has for them, so they get
  // their own screen. It has to be reachable and it has to draw all twenty.
  const full = await state(async () => {
    const g = window.game;
    const before = g.board;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    const opened = g.board;
    g.draw();
    // Count the rows actually rendered, by tallying fillText calls the board
    // makes for rank numbers.
    const ranks = new Set();
    const ctx = g.out;
    const realFill = ctx.fillText.bind(ctx);
    ctx.fillText = (txt, x, y) => {
      const m = /^(\d{1,2})\.$/.exec(String(txt));
      if (m) ranks.add(Number(m[1]));
      return realFill(txt, x, y);
    };
    g.draw();
    ctx.fillText = realFill;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const closed = g.board;
    return { before, opened, closed, rows: ranks.size, max: Math.max(...ranks) };
  });
  check('the full board opens on T, closes on ESC and shows all twenty',
        full.before === false && full.opened === true && full.closed === false &&
        full.rows === 20 && full.max === 20);

  const rec = await state(() => {
    const g = window.game;
    const p = g.profiles.active;
    p.bestScore = 500; p.bestWave = 3; p.bestCombo = 4; p.games = 1;
    const first = g.profiles.record({ score: 900, wave: 6, combo: 12, solved: 8, attempts: 10 });
    const second = g.profiles.record({ score: 100, wave: 1, combo: 2, solved: 1, attempts: 4 });
    return { first, second, best: p.bestScore, wave: p.bestWave, games: p.games };
  });
  check('a run updates personal bests only when it beats them',
        rec.first.score && !rec.second.score && rec.best === 900 && rec.wave === 6 && rec.games === 3);

  // Facts are stored per profile, so two players do not blur together.
  const scoped = await state(() => {
    const g = window.game;
    const a = g.skill.storeKey;
    g.skill.record(7, 8, 2.0, true);
    const madeB = g.profiles.create('Second Player');
    g.skill.useProfile(g.profiles.activeId);
    const b = g.skill.storeKey;
    const emptyForB = g.skill.facts.size;
    g.skill.useProfile(a.split('.').pop());
    return { differs: a !== b, emptyForB, madeB: Boolean(madeB) };
  });
  check('a new profile starts with an empty fact history',
        scoped.differs && scoped.madeB && scoped.emptyForB === 0);

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

  // --- touchscreen -----------------------------------------------------------
  // A separate context, because touch support is decided by the pointer media
  // query at load and cannot be turned on inside an existing page.
  const mErrs = [];
  const openPhone = async (w, h) => {
    const c = await browser.newContext({
      viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
    });
    const pg = await c.newPage();
    pg.on('pageerror', (e) => mErrs.push(e.message));
    await pg.goto(`${BASE}/?q=medium`, { waitUntil: 'load' });
    await pg.evaluate(() => { try { localStorage.clear(); } catch { /* private mode */ } });
    await pg.reload({ waitUntil: 'load' });
    await pg.waitForTimeout(450);
    return { c, pg };
  };

  const up = await openPhone(390, 844);
  const portrait = await up.pg.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    touch: window.game.touch,
    portrait: window.game.portrait,
    mode: window.game.inputMode,
  }));
  check('an upright phone is detected and asked to rotate',
        portrait.coarse && portrait.touch && portrait.portrait);
  check('touch defaults to the pick-an-answer layout', portrait.mode === 'choose');
  await up.c.close();

  const side = await openPhone(844, 390);
  const pg = side.pg;
  const canvas = await pg.$('#game');
  const box = await canvas.boundingBox();
  const tap = async (vx, vy) => {
    await pg.touchscreen.tap(box.x + (vx / 1280) * box.width, box.y + (vy / 720) * box.height);
    await pg.waitForTimeout(280);
  };

  check('landscape clears the rotate prompt',
        !(await pg.evaluate(() => window.game.portrait)));

  // Answer targets have to clear the ~44px physical minimum once scaled down.
  const targets = await pg.evaluate(() => {
    const scale = document.getElementById('game').getBoundingClientRect().height / 720;
    const btn = 74 * scale;
    return { btn, scale };
  });
  check('on-screen buttons stay thumb-sized after scaling', targets.btn >= 38);

  await tap(640, 235);                                  // + NEW PLAYER
  check('tapping opens name entry', await pg.evaluate(() => window.game.naming));
  await pg.fill('#nameField', 'Sam');
  await pg.waitForTimeout(150);
  await tap(640, 414);                                  // START
  check('a profile can be created entirely by touch',
        (await pg.evaluate(() => window.game.profiles.active?.name)) === 'Sam');

  await tap(640, 360);                                  // begin
  await pg.waitForTimeout(2600);
  const inPlay = await pg.evaluate(() => ({
    state: window.game.state, choices: window.game.choices.length,
  }));
  check('a run starts from a tap with four answers offered',
        inPlay.state === 'playing' && inPlay.choices === 4);

  const pick = await pg.evaluate(() => {
    const g = window.game;
    return { i: g.choices.findIndex((c) => g.targetBeast && g.targetBeast.accepts(c)), solved: g.solved };
  });
  if (pick.i >= 0) {
    const gap = 14, w = 168, total = 4 * w + 3 * gap;
    await tap(640 - total / 2 + pick.i * (w + gap) + w / 2, 644);
  }
  check('tapping an answer fires it',
        (await pg.evaluate(() => window.game.solved)) > pick.solved);

  await pg.evaluate(() => { window.game.overcharge = 1; window.game.chargeReady = true; });
  await tap(18 + 55, 720 - 18 - 37);
  // Not "=== 0": firing clears chargeReady, so a projectile still in flight
  // resolving afterwards legitimately starts recharging from zero.
  const beamed = await pg.evaluate(() => ({
    charge: window.game.overcharge, fired: Boolean(window.game.beamFx),
  }));
  check('the on-screen beam button discharges overcharge and fires',
        beamed.charge < 1 && beamed.fired);

  // Navigation used to be a row of five unlabelled glyphs outside a run and
  // nothing at all inside one, so a player on a phone could not leave a run or
  // change player. One labelled menu replaced it.
  const menuBtn = [1280 - 18 - 37, 720 - 18 - 37];
  await tap(...menuBtn);
  const menuMid = await pg.evaluate(() => {
    const { menuItems } = window.__menu;
    const g = window.game;
    return { open: g.menu, paused: g.paused, ids: menuItems(g).map((i) => i.id) };
  });
  check('the menu opens mid-run and offers a way out',
        menuMid.open && menuMid.paused &&
        menuMid.ids.includes('resume') && menuMid.ids.includes('quit') &&
        menuMid.ids.includes('player'));

  // Resume has to actually resume. Closing the menu left the run paused, so
  // the next tap went on unpausing instead of on the game.
  const rowY0 = (i) => 150 + i * 72 + 31;
  await tap(640, rowY0(menuMid.ids.indexOf('resume')));
  check('resume closes the menu and unpauses',
        await pg.evaluate(() => !window.game.menu && !window.game.paused));
  await tap(1280 - 18 - 37, 720 - 18 - 37);

  // The thing that was impossible before: leaving a run to change player.
  const rowY = (i) => 150 + i * 72 + 31;
  const playerRow = menuMid.ids.indexOf('player');
  const beforeScores = await pg.evaluate(() => window.game.scores.list.length);
  await tap(640, rowY(playerRow));
  const switched = await pg.evaluate(() => ({
    state: window.game.state, menu: window.game.menu,
    scores: window.game.scores.list.length,
  }));
  check('change player leaves the run and reaches the player picker',
        switched.state === 'profile' && !switched.menu);
  // Leaving must not quietly bin the run: the score is recorded either way.
  check('a run left through the menu still records its score',
        switched.scores >= beforeScores);

  // And from outside a run the menu reaches everything the glyphs used to.
  await tap(...menuBtn);
  const menuOut = await pg.evaluate(() => {
    const { menuItems } = window.__menu;
    return menuItems(window.game).map((i) => i.id);
  });
  check('the menu reaches the board, the sky and the report between runs',
        ['board', 'sky', 'report', 'help'].every((id) => menuOut.includes(id)));
  await tap(640, rowY(menuOut.indexOf('help')));
  check('a menu entry opens what it names',
        await pg.evaluate(() => window.game.help && !window.game.menu));

  // A phone browser's URL bar shrinks the *visual* viewport while
  // window.innerHeight -- the layout viewport -- stays put. Sizing the canvas
  // to innerHeight made it taller than the screen, so the top of the playfield
  // sat behind the bar. Simulate the bar and check the canvas follows.
  const bar = await pg.evaluate(() => {
    const el = document.getElementById('game');
    const layout = window.innerHeight;
    const real = window.visualViewport;
    const before = Math.round(el.getBoundingClientRect().height);
    const fake = {
      width: real.width,
      height: real.height - 96,
      addEventListener: real.addEventListener.bind(real),
      removeEventListener: real.removeEventListener.bind(real),
    };
    Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true });
    window.game._fit();
    const after = Math.round(el.getBoundingClientRect().height);
    Object.defineProperty(window, 'visualViewport', { get: () => real, configurable: true });
    window.game._fit();
    return { layout, visible: Math.round(fake.height), before, after };
  });
  check('the canvas fits the visible viewport, not the space behind the URL bar',
        bar.after <= bar.visible && bar.before > bar.visible && bar.layout === bar.before);

  // The browser's URL bar and menu sit over the top of the playfield until the
  // game goes fullscreen. Two bugs used to stop that: the orientation lock was
  // requested *before* fullscreen (it rejects unless the document is already
  // fullscreen), and the listener was `once`, so a single refusal left the
  // browser chrome there for the rest of the session.
  // Earlier touch tests have already tapped this page, so start from a known
  // state rather than assuming the browser chrome is still showing.
  await pg.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : null));
  await pg.waitForTimeout(300);
  const chrome = await pg.evaluate(() => ({ full: Boolean(document.fullscreenElement) }));
  await tap(640, 300);
  await pg.waitForTimeout(400);
  const entered = await pg.evaluate(() => Boolean(document.fullscreenElement));
  // Leaving and tapping again has to get it back -- this is what `once` broke.
  // Guarded: exitFullscreen() on a document that is not fullscreen throws, and
  // a thrown assertion is a crashed suite rather than a reported failure.
  await pg.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : null));
  await pg.waitForTimeout(300);
  const left = await pg.evaluate(() => Boolean(document.fullscreenElement));
  await tap(640, 300);
  await pg.waitForTimeout(400);
  const regained = await pg.evaluate(() => Boolean(document.fullscreenElement));
  check('a tap hides the browser chrome, and leaving fullscreen is recoverable',
        !chrome.full && entered && !left && regained);

  // The title screen told a phone player to press H, T, S, G, ESC, C, R, Q and
  // M -- nine keys that do not exist on a touchscreen. Those destinations are
  // buttons now.
  await pg.evaluate(() => {
    const g = window.game;
    g.menu = false; g.help = false; g.board = false; g.sky = false; g.report = false;
    g.state = 'title';
  });
  const chipHits = {};
  for (const [i, key] of [[0, 'help'], [1, 'board'], [2, 'sky'], [3, 'report']]) {
    await tap(640 - (4 * 250 + 3 * 16) / 2 + i * 266 + 125, 650);
    chipHits[key] = await pg.evaluate((k) => ({
      open: Boolean(window.game[k]), playing: window.game.state === 'playing',
    }), key);
    await pg.evaluate((k) => { window.game[k] = false; }, key);
  }
  check('every title-screen destination is a button on a touchscreen',
        ['help', 'board', 'sky', 'report'].every((k) => chipHits[k].open && !chipHits[k].playing));
  // And the fallback still works: a tap that is not a chip or a tier plays.
  await tap(640, 200);
  check('tapping elsewhere on the title still starts a run',
        await pg.evaluate(() => window.game.state === 'playing'));

  // Name entry was a one-way door on a phone: no ESC, and a tap outside the
  // field only refocused it.
  const escaped = await pg.evaluate(() => {
    const g = window.game;
    g.state = 'profile';
    g._startNaming();
    return g.naming;
  });
  await tap(640 - 250 + 65, 386 + 28);
  check('name entry can be left without a keyboard',
        escaped && !(await pg.evaluate(() => window.game.naming)));

  check('no runtime errors on the phone', mErrs.length === 0);
  if (mErrs.length) console.log(mErrs.join('\n'));
  await side.c.close();

  // --- the sky, the chain, the last stand ------------------------------------

  // The skill table keyed facts as `${a}*${b}`, so `7 + 8` and `7 x 8` were the
  // same entry: the adaptive weighting mixed them and the game-over list drew
  // both as `7x8`. The star chart would have put that on screen.
  const facts = await state(async () => {
    const { SkillTable, mastery, MASTERED } = await import('/src/problems.js');
    const t = new SkillTable('test-facts');
    t.facts.clear();
    t.record(7, 8, '×', 1.0, true);
    t.record(7, 8, '+', 1.0, true);
    const distinct = t.facts.size;
    // Legacy rows carry no op and were all multiplication.
    t.facts.clear();
    localStorage.setItem(t.storeKey, JSON.stringify([{ a: 6, b: 7, ema: 1.1, misses: 0, seen: 9 }]));
    t.load();
    const migrated = [...t.facts.values()][0];

    // Mastery needs speed, accuracy and repetition -- one fast answer is not it.
    const fast1 = mastery({ a: 2, b: 2, ema: 1.0, misses: 0, seen: 1 });
    const solid = mastery({ a: 2, b: 2, ema: 1.0, misses: 0, seen: 9 });
    const slow = mastery({ a: 2, b: 2, ema: 4.6, misses: 0, seen: 9 });
    const missy = mastery({ a: 2, b: 2, ema: 1.0, misses: 5, seen: 9 });
    return { distinct, migrated, fast1, solid, slow, missy, MASTERED };
  });
  check('adding and multiplying the same pair are different facts', facts.distinct === 2);
  check('facts saved before the op existed are read as multiplication',
        facts.migrated.op === '×' && facts.migrated.seen === 9);
  check('mastery needs speed, accuracy and repetition together',
        facts.solid >= facts.MASTERED && facts.fast1 < 0.4 &&
        facts.slow < facts.MASTERED && facts.missy < facts.MASTERED);

  const sky = await state(async () => {
    const { chartStats, tables } = await import('/src/ui/starchart.js');
    const g = window.game;
    g.skill.facts.clear();
    const empty = chartStats(g.skill);
    // Light the whole 5x table, both directions.
    for (let n = 2; n <= 12; n++) {
      g.skill.facts.set(g.skill.key(5, n, '×'), { a: 5, b: n, op: '×', ema: 1.1, misses: 0, seen: 9 });
      g.skill.facts.set(g.skill.key(n, 5, '×'), { a: n, b: 5, op: '×', ema: 1.1, misses: 0, seen: 9 });
    }
    const lit = chartStats(g.skill);
    g.sky = true;
    g.draw();                       // must not throw with a partly-filled sky
    const open = g.sky;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    return { empty, lit, named: tables(g.skill), open, closed: g.sky };
  });
  check('an empty sky is empty and a finished table is one constellation',
        sky.empty.known === 0 && sky.empty.constellations === 0 &&
        sky.lit.known === 21 && JSON.stringify(sky.named) === '[5]');
  check('the star chart opens and closes', sky.open === true && sky.closed === false);

  // Chaining: solving one answer takes out the answers that share a factor
  // with it, and leaves the ones that do not.
  const chain = await state(async () => {
    const { MultBeast } = await import('/src/entities/beasts/index.js');
    const g = window.game;
    g.state = 'playing';
    g.beasts = [];
    g.chainFx = [];
    g.combo = 12;
    const before = g.score;
    const put = (a, b, x) => { const m = new MultBeast(a, b, x, 300, 0); m.speed = 0; g.beasts.push(m); return m; };
    const seed = put(2, 3, 640);      // 6
    put(4, 6, 700);                   // 24 -- a multiple
    put(3, 4, 580);                   // 12 -- a multiple
    put(5, 7, 300);                   // 35 -- not
    put(7, 1, 980);                   // 7  -- not
    g._chain(seed);
    return {
      dead: g.beasts.filter((b) => b.state !== 'alive').map((b) => b.answerText).sort(),
      alive: g.beasts.filter((b) => b.state === 'alive').map((b) => b.answerText).sort(),
      bolts: g.chainFx.length,
      scored: g.score > before,
      combo: g.combo,
    };
  });
  check('a solved answer chains to the answers it divides into',
        JSON.stringify(chain.dead) === '["12","24"]' &&
        JSON.stringify(chain.alive) === '["35","6","7"]' &&
        chain.bolts === 2 && chain.scored);
  // The chained beasts were not answered, so they must not inflate the streak.
  check('a chain pays out but does not touch the combo', chain.combo === 12);

  const stand = await state(() => {
    const g = window.game;
    g.state = 'playing';
    g.cores = 3;
    g.lastStandT = 0;
    g.audio.stark = false;
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    const calm = { t: g.lastStandT, stark: Boolean(g.audio.stark) };
    g.cores = 1;
    g.audio.lastStand();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    const grim = { t: g.lastStandT, stark: Boolean(g.audio.stark) };
    g.audio.restart();
    return { calm, grim, restarted: Boolean(g.audio.stark) };
  });
  check('the last core drains the colour and strips the arrangement',
        stand.calm.t < 0.05 && !stand.calm.stark &&
        stand.grim.t > 0.7 && stand.grim.stark && !stand.restarted);

  // --- the progress ledger ----------------------------------------------------
  //
  // The skill table only recorded facts carrying an (a, b) pair -- four of the
  // twelve beast types. Factoring, fractions, fraction arithmetic, percents,
  // powers, additive inverses and the equation bosses recorded nothing, so a
  // parent's coverage page would have shown blanks for half the curriculum and
  // implied it was never practised.
  const concepts = await state(async () => {
    const M = await import('/src/entities/beasts/index.js');
    const { tierById } = await import('/src/difficulty.js');
    const { CONCEPTS } = await import('/src/progress.js');
    const g = window.game;
    const known = new Set(CONCEPTS.map((c) => c.id));
    const seen = new Set();
    let unnamed = 0;
    for (const id of ['easy', 'medium', 'hard']) {
      const tier = tierById(id);
      for (let wave = 1; wave <= 12; wave++) {
        for (let i = 0; i < 120; i++) {
          const c = M.makeBeast(tier, wave, g.skill, 640, 100, 40).concept;
          if (!c || c === 'other') unnamed++;
          seen.add(c);
        }
      }
      seen.add(M.makeBoss(tier, 5, 0, 0, 0).concept);
    }
    return { seen: [...seen].sort(), unnamed, unlisted: [...seen].filter((c) => !known.has(c)) };
  });
  check('every beast the game can spawn names a concept the ledger lists',
        concepts.unnamed === 0 && concepts.unlisted.length === 0 && concepts.seen.length >= 10);
  if (concepts.unlisted.length) console.log('unlisted:', concepts.unlisted.join(', '));

  const ledger = await state(async () => {
    const { Progress, dayKey } = await import('/src/progress.js');
    const p = new Progress('test-progress');
    p.data = { concepts: {}, days: {}, runs: 0, firstSeen: dayKey() };
    p.record('percent', 0, true, 2.0);
    p.record('percent', 0, true, 4.0);
    p.record('percent', 0, false, 9.9);   // a wrong answer must not time anything
    p.landed('percent', 0);
    // A different level of the same concept is a separate row, but the parent
    // page sums them: "how is percentages going" is one question.
    p.record('percent', 1, true, 3.0);
    const row = p.summary().find((r) => r.id === 'percent');
    const untouched = p.summary().find((r) => r.id === 'power');

    // A streak survives not having played *yet* today, and breaks on a real gap.
    const back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };
    p.data.days = {};
    for (const n of [1, 2, 3]) p.data.days[back(n)] = { seen: 5, correct: 4 };
    const yesterdayRun = p.streak();
    p.data.days[back(9)] = { seen: 5, correct: 4 };
    const acrossGap = p.streak();
    p.data.days = { [back(4)]: { seen: 1, correct: 1 } };
    const stale = p.streak();

    // The day log must not grow without bound for a daily player.
    p.data.days = {};
    for (let n = 0; n < 400; n++) p.data.days[back(n)] = { seen: 1, correct: 1 };
    p.save();
    const kept = Object.keys(p.data.days).length;

    return {
      row, untouched, yesterdayRun, acrossGap, stale, kept,
      rowKeys: [...p.rowMap().keys()],
      recentLen: p.recent(30).length,
    };
  });
  check('the ledger records every concept, timing only correct answers',
        ledger.row.seen === 4 && ledger.row.correct === 3 && ledger.row.landed === 1 &&
        Math.abs(ledger.row.avgSeconds - 3) < 0.01);
  check('levels are separate rows but one concept to a parent',
        ledger.rowKeys.includes('percent@0') && ledger.rowKeys.includes('percent@1') &&
        ledger.row.level === 1);
  check('a concept never practised reports as a gap, not as absent',
        ledger.untouched && ledger.untouched.seen === 0 && ledger.untouched.accuracy === 0);
  check('the streak survives a day not played yet and breaks on a real gap',
        ledger.yesterdayRun === 3 && ledger.acrossGap === 3 && ledger.stale === 0);
  check('the day log is capped', ledger.kept === 120 && ledger.recentLen === 30);

  const reportPage = await state(() => {
    const g = window.game;
    g.report = true;
    g.draw();                      // must render with a mostly-empty ledger
    const open = g.report;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    return { open, closed: g.report };
  });
  check('the progress page opens on G and closes on ESC',
        reportPage.open === true && reportPage.closed === false);

  // --- dynamic difficulty -----------------------------------------------------
  //
  // The point of the mode: material that has been mastered recedes and material
  // that has not arrives. Concept-by-concept, not a blend of the three fixed
  // tiers -- mastering single-digit addition has to shrink *single-digit*
  // addition, not "easy".
  const adapt = await state(async () => {
    const { Progress, dayKey } = await import('/src/progress.js');
    const { plan, pickPlan } = await import('/src/adaptive.js');
    const today = dayKey();
    const fresh = () => {
      const p = new Progress('test-adapt');
      p.data = { concepts: {}, days: {}, runs: 0, firstSeen: today };
      p.save = () => {};
      return p;
    };
    const shareOf = (entries, id, level) => {
      const e = entries.find((x) => x.id === id && x.level === level);
      return e && !e.locked ? e.share : 0;
    };
    const master = (p, id, level, n = 60) => {
      for (let i = 0; i < n; i++) p.record(id, level, true, 1.2);
    };

    // Cold start: only what has no prerequisites, at its first level.
    const cold = plan(fresh(), today);
    const coldOpen = cold.filter((e) => !e.locked).map((e) => `${e.id}@${e.level}`);

    // Master single-digit addition and nothing else.
    const p = fresh();
    const before = shareOf(plan(p, today), 'add', 0);
    master(p, 'add', 0);
    const after = plan(p, today);
    const addL1 = shareOf(after, 'add', 0);
    const addL2 = shareOf(after, 'add', 1);

    // Every concept mastered end to end: does anything ever spawn locked?
    const full = fresh();
    for (const id of ['add', 'sub', 'mult', 'div', 'factor', 'inverse', 'fraction',
                      'power', 'percent', 'fracop', 'integer']) {
      for (let lv = 0; lv < 3; lv++) master(full, id, lv);
    }
    const mature = plan(full, today);

    // A weighted roll must never return something locked.
    const lockedIds = new Set(cold.filter((e) => e.locked).map((e) => e.id));
    let leaked = 0;
    const coldPlan = fresh();
    for (let i = 0; i < 400; i++) {
      const got = pickPlan(cold, () => i / 400);
      if (lockedIds.has(got.id)) leaked++;
    }
    return {
      coldOpen, before, addL1, addL2, leaked,
      matureLocked: mature.filter((e) => e.locked).length,
      matureMin: Math.min(...mature.map((e) => e.share)),
    };
  });
  check('a cold start opens only what has no prerequisites',
        JSON.stringify(adapt.coldOpen) === '["add@0"]');
  // The literal ask: mastering single-digit addition shrinks single-digit
  // addition and brings in two-digit.
  check('mastering a level shrinks it and promotes to the next',
        adapt.addL1 < adapt.before * 0.25 && adapt.addL2 > adapt.addL1 * 3);
  // The first version dropped cleared levels to exactly zero. A shrinking
  // share has to mean a trickle, or there is no spaced retrieval at all.
  check('a cleared level keeps a share rather than switching off',
        adapt.addL1 > 0);
  check('a locked concept never spawns', adapt.leaked === 0);
  check('everything unlocks eventually and nothing starves',
        adapt.matureLocked === 0 && adapt.matureMin > 0);

  // A plan has to build the beast it names. Two concepts are named differently
  // from the case that builds them, and unmapped they would silently fall
  // through to multiplication.
  const planned = await state(async () => {
    const M = await import('/src/entities/beasts/index.js');
    const { tierById } = await import('/src/difficulty.js');
    const { CURRICULUM } = await import('/src/curriculum.js');
    const g = window.game;
    const tier = tierById('dynamic');
    const out = {};
    for (const c of CURRICULUM) {
      for (let lv = 0; lv < c.levels.length; lv++) {
        const b = M.makeBeast(tier, 5, g.skill, 640, 100, 40, { id: c.id, level: lv });
        const key = `${c.id}@${lv}`;
        out[key] = { concept: b.concept, level: b.level, ok: b.accepts(b.answerText) };
      }
    }
    return out;
  });
  const wrongKind = Object.entries(planned).filter(([k, v]) => !k.startsWith(`${v.concept}@`));
  const wrongLevel = Object.entries(planned).filter(([k, v]) => k !== `${v.concept}@${v.level}`);
  const wrongAnswer = Object.entries(planned).filter(([, v]) => !v.ok);
  check('a plan builds the concept and level it names, and it answers itself',
        wrongKind.length === 0 && wrongLevel.length === 0 && wrongAnswer.length === 0);
  if (wrongKind.length) console.log('wrong kind:', wrongKind.map(([k, v]) => `${k}->${v.concept}`).join(' '));

  // --- installable app ------------------------------------------------------
  //
  // The Play Store route (Capacitor or a TWA) needs a real PWA underneath it,
  // and "it works offline" is the one claim that cannot be read off the source.

  // sw.js is generated. If a source file is added and tools/gen-sw.mjs is not
  // re-run, the app silently ships without that file cached -- which shows up
  // only on a plane. Comparing the committed list to what is on disk turns that
  // into a test failure at the moment it happens.
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const listed = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
  const stamped = sw.match(/const VERSION = '([0-9a-f]+)';/)[1];
  const onDisk = assets();
  check('the service worker precache list matches the files on disk',
        JSON.stringify(listed) === JSON.stringify(onDisk));
  check('the service worker version tracks asset content',
        stamped === version(onDisk));

  // Hosting: GitHub Pages, and most static hosts, serve a project from a
  // subpath rather than the root of a domain. Every URL the app ships has to be
  // relative for that to work. The manifest carried `"id": "/mathblast/"` --
  // an absolute path that matched nothing on a subpath, and would not even have
  // matched by case on Pages.
  const manifestText = readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8');
  const manifest = JSON.parse(manifestText);
  const indexText = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const rooted = [
    ...Object.entries(manifest)
      .filter(([, v]) => typeof v === 'string' && v.startsWith('/'))
      .map(([k]) => `manifest.${k}`),
    ...(manifest.icons || []).filter((i) => i.src.startsWith('/')).map((i) => `icon ${i.src}`),
    ...[...indexText.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => `index.html ${m[1]}`),
    ...listed.filter((a) => a.startsWith('/')).map((a) => `sw.js ${a}`),
  ];
  check('every shipped URL is relative, so the app survives a subpath host',
        rooted.length === 0);
  if (rooted.length) console.log('absolute:', rooted.join(', '));

  const app = await browser.newContext({
    viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
  });
  const ap = await app.newPage();
  const aErrs = [];
  ap.on('pageerror', (e) => aErrs.push('pageerror: ' + e.message));
  ap.on('console', (m) => { if (m.type() === 'error') aErrs.push('console: ' + m.text()); });
  await ap.goto(BASE, { waitUntil: 'load' });

  const installable = await ap.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
    await document.fonts.ready;
    return {
      active: Boolean(reg.active),
      scope: new URL(reg.scope).pathname,
      display: m.display,
      orientation: m.orientation,
      maskable: m.icons.some((i) => i.purpose === 'maskable'),
      sizes: m.icons.map((i) => i.sizes).sort(),
      // The font used to come from Google Fonts, which an installed app cannot
      // reach on first launch offline.
      fontLocal: document.fonts.check('700 24px "JetBrains Mono"'),
      fontRemote: [...document.styleSheets].some((sh) => (sh.href || '').includes('googleapis')),
    };
  });
  check('the app is installable: worker at the root, fullscreen, landscape, maskable icon',
        installable.active && installable.scope === '/' &&
        installable.display === 'fullscreen' && installable.orientation === 'landscape' &&
        installable.maskable && installable.sizes.includes('512x512'));
  check('the typeface ships with the game rather than coming off a CDN',
        installable.fontLocal && !installable.fontRemote);

  // Give the worker a moment to finish precaching, then pull the plug.
  await ap.waitForTimeout(1500);
  const cachedCount = await ap.evaluate(async () => {
    const keys = (await caches.keys()).filter((k) => k.startsWith('mathblast-'));
    return (await (await caches.open(keys[0])).keys()).length;
  });
  await app.setOffline(true);
  await ap.reload({ waitUntil: 'load' });
  await ap.waitForTimeout(1000);
  const offline = await ap.evaluate(() => ({
    booted: Boolean(window.game),
    drew: (() => { try { window.game.draw(); return true; } catch { return false; } })(),
    font: document.fonts.check('700 24px "JetBrains Mono"'),
  }));
  await app.setOffline(false);
  check('the whole app is precached', cachedCount === onDisk.length);
  check('it boots, draws and keeps its typeface with the network off',
        offline.booted && offline.drew && offline.font);
  check('no runtime errors installing or running offline', aErrs.length === 0);
  if (aErrs.length) console.log(aErrs.join('\n'));
  await app.close();

  await browser.close();
  stop();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
