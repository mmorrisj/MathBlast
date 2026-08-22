// MathBlast.
//
// Fixed 1280x720 virtual resolution drawn straight into the visible canvas and
// letterboxed by CSS, so render cost is constant regardless of window size.

import { clamp, damp, rand, randInt, power } from './util.js';
import { theme, setThemeWave, setColorSafe, setReducedMotion } from './theme.js';
import { Audio } from './audio.js';
import { SkillTable, makeChoices } from './problems.js';
import { Camera } from './fx/camera.js';
import { Particles } from './fx/particles.js';
import { Shockwaves } from './fx/shockwave.js';
import { Orbs } from './fx/orbs.js';
import { Post } from './render/post.js';
import { Starfield } from './render/starfield.js';
import { Shield, CX } from './entities/shield.js';
import { Projectile, Turret } from './entities/projectile.js';
import { makeBeast, makeBoss, isBossWave, SplitBeast } from './entities/beasts/index.js';
import { drawHud, drawTitle, drawGameOver, drawFocus, drawInterlude, choiceHitTest } from './ui/hud.js';
import { Quality } from './quality.js';

const W = 1280;
const H = 720;
const INTERLUDE = 2.3;

class Game {
  constructor(canvas) {
    this.display = canvas;
    this.display.width = W;
    this.display.height = H;
    this.ctx = canvas.getContext('2d');
    this.out = this.ctx;

    this.post = new Post(W, H);
    this.stars = new Starfield(W, H);
    this.particles = new Particles();
    this.shockwaves = new Shockwaves();
    this.orbs = new Orbs();
    this.camera = new Camera();
    this.audio = new Audio();
    this.skill = new SkillTable();
    this.quality = new Quality(new URLSearchParams(location.search).get('q'));

    this.state = 'title';
    this.time = 0;
    this.stateTime = 0;
    this.paused = false;
    this.danger = 0;
    this.inputMode = 'type';
    this.choices = [];
    this.choiceIndex = 0;

    const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(Boolean(mq && mq.matches));
    if (mq && mq.addEventListener) mq.addEventListener('change', (e) => setReducedMotion(e.matches));

    this.reset();
    this._bindInput();
    this._fit();
    window.addEventListener('resize', () => this._fit());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.paused = true; });
  }

  reset() {
    this.shield = new Shield();
    this.turret = new Turret(CX, this.shield.domeY(CX) - 26);
    this.beasts = [];
    this.shots = [];
    this.particles.clear();
    this.shockwaves.clear();
    this.orbs.clear();

    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.cores = 3;
    this.wave = 0;
    this.solved = 0;
    this.attempts = 0;
    this.rollingAcc = 0.6;
    this.avgSolve = 3.5;
    this.overcharge = 0;
    this.chargeReady = false;
    this.input = '';
    this.inputPulse = 0;
    this.waveBanner = 0;
    this.wavePhase = 'active';
    this.phaseTimer = 0;
    this.waveMisses = 0;
    this.lastPerfect = false;
    this.spawnTimer = 0;
    this.waveRemaining = 0;
    this.targetBeast = null;
    this.choices = [];

    setColorSafe(theme.colorSafe);
    setThemeWave(1);

    for (let i = 0; i < 8; i++) this.shield.deposit(CX + rand(260, -260), 0.5);
    for (const p of this.shield.plates) { p.pop = 0; p.glow = 0; }
    this.shield.auroras.length = 0;
  }

  // --- input -------------------------------------------------------------

  _bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();

      if (this.state === 'title') {
        if (e.key === 'Enter' || e.key === ' ') this._begin();
        else if (e.key === 'c' || e.key === 'C') setColorSafe(!theme.colorSafe);
        else if (e.key === 'r' || e.key === 'R') setReducedMotion(!theme.reducedMotion);
        return;
      }
      if (this.state === 'gameover') {
        if (e.key === 'Enter') this._begin();
        return;
      }

      if (e.key === 'm' || e.key === 'M') { this.audio.toggleMute(); return; }
      if (e.key === 'p' || e.key === 'P') { this.paused = !this.paused; return; }
      if (e.key === 'q' || e.key === 'Q') { this.quality.cycle(); return; }
      if (e.key === 'c' || e.key === 'C') { setColorSafe(!theme.colorSafe); return; }
      if (e.key === 'r' || e.key === 'R') { setReducedMotion(!theme.reducedMotion); return; }
      if (e.key === 'Tab') { this._setInputMode(this.inputMode === 'type' ? 'choose' : 'type'); return; }
      if (this.paused) { this.paused = false; return; }

      if (e.key === ' ') { this._fireBeam(); return; }

      if (this.inputMode === 'choose') {
        if (e.key === 'ArrowLeft') this.choiceIndex = (this.choiceIndex + 3) % 4;
        else if (e.key === 'ArrowRight') this.choiceIndex = (this.choiceIndex + 1) % 4;
        else if (e.key === 'Enter') this._fire(this.choices[this.choiceIndex]);
        return;
      }

      if ((e.key >= '0' && e.key <= '9') || e.key === '/') {
        if (this.input.length < 5) { this.input += e.key; this.inputPulse = 1; }
      } else if (e.key === 'Backspace') {
        this.input = this.input.slice(0, -1); this.inputPulse = 1;
      } else if (e.key === 'Escape') {
        this.input = ''; this.inputPulse = 1;
      } else if (e.key === 'Enter') {
        this._fire(this.input);
      }
    });

    const pointer = (ev) => {
      this.audio.resume();
      if (this.state === 'title') { this._begin(); return; }
      if (this.state === 'gameover') { this._begin(); return; }
      const rect = this.display.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const py = ((ev.clientY - rect.top) / rect.height) * H;
      if (this.inputMode === 'choose') {
        const hit = choiceHitTest(px, py, this.choices);
        if (hit >= 0) { this.choiceIndex = hit; this._fire(this.choices[hit]); }
      }
    };
    window.addEventListener('pointerdown', pointer);
    // Touch implies no keyboard: switch to the pick-an-answer layout.
    window.addEventListener('touchstart', () => this._setInputMode('choose'), { passive: true });
    window.addEventListener('gamepadconnected', () => this._setInputMode('choose'));
  }

  _begin() {
    this.audio.start();
    this.audio.restart();
    if (this.state !== 'playing') {
      this.reset();
      this.state = 'playing';
      this.stateTime = 0;
      this._nextWave();
    }
  }

  _setInputMode(mode) {
    if (this.inputMode === mode) return;
    this.inputMode = mode;
    this.input = '';
    this.choiceIndex = 0;
    this._refreshChoices();
    const hint = document.getElementById('hint');
    if (hint) {
      hint.textContent = mode === 'choose'
        ? 'TAP or ◀ ▶ to pick  ·  ENTER fire  ·  SPACE overcharge  ·  TAB type instead'
        : '0-9 and / answer  ·  ENTER fire  ·  SPACE overcharge  ·  TAB pick instead  ·  P pause  ·  M mute';
    }
  }

  _refreshChoices() {
    this.choices = this.targetBeast && this.inputMode === 'choose'
      ? makeChoices(this.targetBeast)
      : [];
    this.choiceIndex = 0;
  }

  // Gamepad polling: d-pad or left stick to pick, A to fire.
  _pollGamepad() {
    if (!navigator.getGamepads) return;
    for (const gp of navigator.getGamepads()) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0;
      const left = gp.buttons[14]?.pressed || ax < -0.6;
      const right = gp.buttons[15]?.pressed || ax > 0.6;
      const fire = gp.buttons[0]?.pressed;
      const beam = gp.buttons[1]?.pressed || gp.buttons[7]?.pressed;
      if (this.state !== 'playing') {
        if (fire && !this._gpFire) this._begin();
      } else if (this.inputMode === 'choose') {
        if (left && !this._gpLeft) this.choiceIndex = (this.choiceIndex + 3) % 4;
        if (right && !this._gpRight) this.choiceIndex = (this.choiceIndex + 1) % 4;
        if (fire && !this._gpFire) this._fire(this.choices[this.choiceIndex]);
        if (beam && !this._gpBeam) this._fireBeam();
      }
      this._gpLeft = left; this._gpRight = right; this._gpFire = fire; this._gpBeam = beam;
      return;
    }
  }

  _fire(raw) {
    const t = this.targetBeast;
    if (!t || !raw) return;
    const correct = t.accepts(raw);
    const elapsed = performance.now() / 1000 - t.bornAt;

    if (t.a != null && t.b != null) this.skill.record(t.a, t.b, elapsed, correct);
    this.attempts++;
    if (correct) this.solved++;
    this.rollingAcc = this.rollingAcc * 0.82 + (correct ? 1 : 0) * 0.18;
    this.audio.setAccuracy(this.rollingAcc);

    t.locked = true;
    t.pendingRaw = raw;
    t.pendingCorrect = correct;
    t.solveTime = elapsed;

    const m = this.turret.muzzle;
    this.shots.push(new Projectile(m.x, m.y, t, raw, correct));
    this.turret.fire();
    this.audio.fire(m.x);
    this.input = '';
    this.inputPulse = 1;
  }

  // Overcharge: clears every beast in a column. Earned by answering faster than
  // your own rolling average, so it rewards fluency rather than mere accuracy.
  _fireBeam() {
    if (this.overcharge < 1 || this.state !== 'playing') return;
    const x = this.targetBeast ? this.targetBeast.x : CX;
    this.overcharge = 0;
    this.chargeReady = false;
    this.audio.beam(x);
    this.camera.shake(0.8);
    this.camera.stop(0.06);
    this.beamFx = { x, t: 0 };

    for (const b of this.beasts) {
      if (!b.alive || Math.abs(b.x - x) > 95) continue;
      const pw = power(b.magnitude);
      b.locked = true;
      this._destroy(b, pw, true);
    }
    for (let i = 0; i < 60; i++) {
      this.particles.spawn({
        x: x + rand(80, -80), y: rand(H),
        vx: rand(60, -60), vy: rand(-500, -1200),
        life: rand(0.7, 0.3), size: rand(5, 2),
        hue: theme.friendly + rand(30, -10), stretch: 1.3, drag: 0.7,
      });
    }
  }

  // --- waves -------------------------------------------------------------

  _nextWave() {
    this.wave++;
    setThemeWave(this.wave);
    this.audio.setWave(this.wave);
    this.waveBanner = 2.2;
    this.waveMisses = 0;
    this.wavePhase = 'active';
    this.boss = null;
    if (isBossWave(this.wave)) {
      this.waveRemaining = 2;
      this.spawnTimer = 2.2;
      const b = makeBoss(this.wave, CX + rand(200, -200), -140, 26 + this.wave);
      this.beasts.push(b);
      this.boss = b;
    } else {
      this.waveRemaining = 3 + Math.floor(this.wave * 1.4);
      this.spawnTimer = 0.6;
    }
  }

  // The held breath between waves: everything cuts, the camera pulls back, and
  // a clean wave gets its chord and a repaired plate before the next punch-in.
  _endWave() {
    this.wavePhase = 'interlude';
    this.phaseTimer = INTERLUDE;
    this.lastPerfect = this.waveMisses === 0;
    this.audio.holdBeat(1.3);
    this.camera.punchIn(0.94, 0, 0);
    if (this.lastPerfect) {
      this.audio.resolve();
      const p = this.shield.repairWorst();
      this.shield.flash = 1;
      if (p) this.particles.burst(p.x, p.y, 30, { hue: theme.friendly, speed: 240, life: 0.9, size: 4 });
      this.shockwaves.spawn(CX, this.shield.domeY(CX), 1.1, { hue: theme.friendly, split: 0.4 });
      this.score += 250 + this.wave * 60;
    }
  }

  _spawn() {
    const x = clamp(rand(W - 160, 160), 120, W - 120);
    const speed = 34 + this.wave * 4 + rand(10);
    this.beasts.push(makeBeast(this.wave, this.skill, x, -80 - rand(120), speed));
    this.waveRemaining--;
  }

  // --- resolution --------------------------------------------------------

  // Everything that happens when a beast is taken apart. `pw` scales the whole
  // impact: ring count, debris, orb payout, hitstop, shake and the kill tone.
  _destroy(b, pw, quiet = false) {
    b.kill();

    this.shockwaves.spawn(b.x, b.y, pw, { hue: b.hue + 22 });
    const digits = b.answerText.replace('/', '').split('');
    this.particles.burst(b.x, b.y, Math.round(26 + pw * 40), {
      hue: 44, speed: 300 + pw * 300, life: 0.7 + pw * 0.5,
      size: 3.5 + pw * 3, glyphs: digits, grav: 130, stretch: 1,
    });
    this.particles.burst(b.x, b.y, Math.round(12 + pw * 18), {
      hue: theme.orb, speed: 480 + pw * 380, life: 0.42, size: 3, stretch: 1.4,
    });

    this.orbs.spawn(b.x, b.y, pw, (x) => this.shield.domePoint(x), theme.orb);

    if (!quiet) {
      this.camera.stop(0.05 + pw * 0.055);
      this.camera.shake(0.16 + pw * 0.3);
    }
  }

  _resolveHit(shot) {
    const b = shot.target;
    if (b.gone || !b.alive) return;
    const pw = power(b.magnitude);

    if (shot.correct) {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);

      // Fluency, measured against the player's own pace.
      this.avgSolve = this.avgSolve * 0.85 + clamp(b.solveTime, 0.3, 12) * 0.15;
      const fast = b.solveTime < this.avgSolve * 0.8;
      if (!this.chargeReady) {
        this.overcharge = clamp(this.overcharge + (fast ? 0.2 : 0.06), 0, 1);
        if (this.overcharge >= 1) { this.chargeReady = true; this.audio.charged(); }
      }

      const speedBonus = clamp(1.8 - b.solveTime / 3, 0, 1.2);
      const mult = Math.min(this.combo, 10);
      this.score += Math.round((40 + b.magnitude) * (1 + speedBonus) * mult / 4);
      this.audio.correct(this.combo, b.x, pw);

      const died = b.resolve(shot.value);
      if (died) {
        this._destroy(b, pw);
        // A composite asteroid fractures into two proportional chunks.
        if (b.children && b.children.length) {
          for (let i = 0; i < b.children.length; i++) {
            const n = b.children[i];
            const dir = i === 0 ? -1 : 1;
            const child = new SplitBeast(n, b.x + dir * 46, b.y + rand(20, -20), b.speed * 1.06);
            child.lurch = 0;
            this.beasts.push(child);
          }
          b.children = null;
        }
      } else {
        // A boss shell cracked but the beast lives.
        this.shockwaves.spawn(b.x, b.y, pw * 0.6, { hue: b.hue + 30 });
        this.particles.burst(b.x, b.y, 34, {
          hue: b.hue + 20, speed: 420, life: 0.7, size: 4.5, stretch: 1,
        });
        this.orbs.spawn(b.x, b.y, pw * 0.45, (x) => this.shield.domePoint(x), theme.orb);
        this.camera.stop(0.05);
        this.camera.shake(0.4);
        b.locked = false;
      }
    } else {
      b.locked = false;
      b.repel();
      this.combo = 0;
      this.waveMisses++;
      this.audio.wrong(b.x);
      this.camera.shake(0.22);
      this.particles.burst(b.x, b.y, 14, { hue: theme.hostile, speed: 200, life: 0.5, size: 3.5 });
      const plate = this.shield.crackPlate(b.x);
      if (plate) this.particles.burst(plate.x, plate.y, 12, { hue: theme.hostile, speed: 220, life: 0.5 });
    }
  }

  // A beast completed its journey: descenders hit the dome, risers escape.
  _arrive(b) {
    const pw = power(b.magnitude);
    this.combo = 0;
    this.waveMisses++;
    b.state = 'dead';

    if (b.rises) {
      // A negative that got away takes shield energy with it.
      const plate = this.shield.crackPlate(b.x);
      this.audio.wrong(b.x);
      this.camera.shake(0.4);
      this.shockwaves.spawn(b.x, 20, pw * 0.7, { hue: theme.void });
      if (plate) this.particles.burst(plate.x, plate.y, 20, { hue: theme.void, speed: 260, life: 0.7 });
      return;
    }

    const y = this.shield.domeY(b.x);
    const absorbed = this.shield.absorb(b.x);
    this.shockwaves.spawn(b.x, y, pw * (absorbed ? 1 : 1.35),
      { hue: absorbed ? theme.friendly : 22 });
    this.audio.land(b.x, pw);

    if (absorbed) {
      this.camera.shake(0.55);
      this.camera.stop(0.06);
      this.particles.burst(b.x, y, Math.round(40 + pw * 30), {
        hue: theme.friendly, speed: 420 + pw * 200, life: 0.9, size: 5, stretch: 1,
      });
    } else {
      this.cores--;
      this.shield.scar(b.x);
      this.shield.loseCore();
      this.camera.shake(1);
      this.camera.stop(0.1);
      this.particles.burst(b.x, y + 20, Math.round(60 + pw * 50), {
        hue: 20, speed: 500 + pw * 260, life: 1.4, size: 6, grav: 260, stretch: 1.2,
      });
      if (this.cores <= 0) {
        this.state = 'gameover';
        this.stateTime = 0;
        this.audio.gameOver();
      }
    }
  }

  // --- update ------------------------------------------------------------

  update(dtReal) {
    this.time += dtReal;
    this.stateTime += dtReal;
    this.inputPulse = Math.max(0, this.inputPulse - dtReal * 3.4);
    this._pollGamepad();

    const dt = this.camera.update(dtReal);
    this.stars.update(dt);
    if (this.beamFx) {
      this.beamFx.t += dtReal;
      if (this.beamFx.t > 0.55) this.beamFx = null;
    }

    if (this.state !== 'playing') {
      this.particles.update(dt);
      this.shockwaves.update(dt);
      this.orbs.update(dt, (o) => this._absorbOrb(o));
      this.shield.update(dt);
      return;
    }

    this.waveBanner = Math.max(0, this.waveBanner - dtReal);

    if (this.wavePhase === 'interlude') {
      this.phaseTimer -= dtReal;
      if (this.phaseTimer <= 0) {
        this.camera.release();
        this._nextWave();
      }
    } else if (this.waveRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this._spawn();
        this.spawnTimer = clamp(2.8 - this.wave * 0.14, 0.9, 2.8) + rand(0.6);
      }
    } else if (this.beasts.length === 0) {
      this._endWave();
    }

    let maxProgress = 0;
    for (const b of this.beasts) {
      const prevDie = b.dieT;
      b.update(dt);
      b.emitCollapse(this.particles, prevDie);
      if (b.alive) {
        maxProgress = Math.max(maxProgress, b.progress(this.shield));
        if (b.arrived(this.shield)) this._arrive(b);
      }
    }
    this.beasts = this.beasts.filter((b) => !b.gone);

    let target = null;
    for (const b of this.beasts) {
      if (!b.alive || b.locked) continue;
      // Bosses always take priority; otherwise the closest to doing damage.
      const score = (b.isBoss ? 1000 : 0) + b.progress(this.shield);
      if (!target || score > target._score) { target = b; target._score = score; }
    }
    if (target !== this.targetBeast) {
      this.targetBeast = target;
      this.input = '';
      this._refreshChoices();
    } else if (this.inputMode === 'choose' && target && this.choices.length &&
               !target.accepts(this.choices.find((c) => target.accepts(c)) || '')) {
      // Boss advanced a stage under the same object: rebuild the options.
      this._refreshChoices();
    }

    for (const s of this.shots) {
      if (s.update(dt)) this._resolveHit(s);
    }
    this.shots = this.shots.filter((s) => !s.dead);

    this.turret.update(dt, this.targetBeast);
    this.shield.update(dt);
    this.particles.update(dt);
    this.shockwaves.update(dt);
    this.orbs.update(dt, (o) => this._absorbOrb(o));

    this.danger = damp(this.danger, this.wavePhase === 'interlude' ? 0 : maxProgress, 5, dtReal);
    this.audio.setDanger(this.danger);

    const nearMiss = !theme.reducedMotion && maxProgress > 0.86 && this.targetBeast;
    this.camera.slowmo = damp(this.camera.slowmo, nearMiss ? 1 : 0, 7, dtReal);
    if (nearMiss) {
      const b = this.targetBeast;
      this.camera.punchIn(1.14, (b.x - W / 2) * 0.35, (b.y - H / 2) * 0.35);
    } else if (this.wavePhase !== 'interlude') {
      this.camera.release();
    }
  }

  _absorbOrb(o) {
    const plates = this.shield.deposit(o.x, o.energy);
    // A full dome has nowhere to put the energy, so it cashes out instead of
    // quietly evaporating.
    if (!plates.length) {
      this.score += Math.round(o.energy * 400);
      this.particles.burst(o.x, o.y, 10, {
        hue: 48, speed: 200, life: 0.6, size: 3.2, stretch: 0.8,
      });
    }
    this.audio.absorb(o.x, this.shield.coverage);
    this.particles.burst(o.x, o.y, 8, {
      hue: theme.orb, speed: 150, life: 0.45, size: 2.8, stretch: 0.6,
    });
    // The dome already answers every deposit with an aurora sweep. Only a plate
    // actually reaching full strength earns a ring, and a small one -- a burst
    // of nine orbs firing nine explosions buries the whole playfield.
    if (plates.some((p) => p.integrity >= 1)) {
      this.shockwaves.spawn(o.x, o.y, 0.2, {
        hue: theme.friendly, rings: 1, radius: 52, width: 2.5, split: 0.25, flash: false,
      });
    }
  }

  // --- draw --------------------------------------------------------------

  draw() {
    const ctx = this.ctx;
    const q = this.quality.s;
    this.particles.scale = q.particles;
    this.post.setBloomDivisor(q.bloomDiv);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Backdrop is drawn outside the camera transform: it is exactly screen
    // sized, so letting zoom or shake move it would expose bare canvas.
    this.stars.draw(ctx, this.danger, q.stars, q.desat ? this.camera.slowmo : 0);

    ctx.save();
    this.camera.apply(ctx, W, H);

    for (const b of this.beasts) b.drawBeam(ctx, this.shield.domeY(b.x), this.time);
    this.shield.draw(ctx);
    if (this.state === 'playing') this.turret.draw(ctx, this.danger, this.overcharge);
    for (const b of this.beasts) b.draw(ctx, b === this.targetBeast);
    for (const s of this.shots) s.draw(ctx);
    if (this.beamFx) this._drawBeam(ctx);
    this.orbs.draw(ctx);
    this.shockwaves.draw(ctx, q.aberration);
    this.particles.draw(ctx);

    ctx.restore();

    if (this.state === 'playing') drawHud(ctx, this, W, H);

    this.post.apply(this.out, {
      bloom: q.bloom ? 0.85 + this.danger * 0.3 : 0,
      aberration: q.aberration ? Math.max(0, this.danger - 0.5) * 0.9 + this.camera.slowmo * 0.25 : 0,
      desat: q.desat ? this.camera.slowmo * 0.7 : 0,
      vignette: 0.5 + this.danger * 0.25,
    });

    if (this.state === 'playing') {
      if (q.desat) drawFocus(this.out, this, W, H, this.camera.slowmo, this.camera);
      if (this.wavePhase === 'interlude') {
        drawInterlude(this.out, this, W, H, 1 - this.phaseTimer / INTERLUDE);
      }
    }
    if (this.state === 'title') drawTitle(this.out, W, H, this.time);
    if (this.state === 'gameover') drawGameOver(this.out, this, W, H, this.stateTime);
    if (this.paused) {
      this.out.save();
      this.out.fillStyle = 'rgba(4,6,16,0.7)';
      this.out.fillRect(0, 0, W, H);
      this.out.fillStyle = '#eaf6ff';
      this.out.font = '700 44px "JetBrains Mono", ui-monospace, monospace';
      this.out.textAlign = 'center';
      this.out.fillText('PAUSED', W / 2, H / 2);
      this.out.restore();
    }
  }

  _drawBeam(ctx) {
    const f = this.beamFx;
    const p = clamp(f.t / 0.55, 0, 1);
    const a = (1 - p) ** 1.6;
    const w = 96 * (1 - p * 0.35);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(f.x - w, 0, f.x + w, 0);
    g.addColorStop(0, `hsla(${theme.friendly}, 100%, 60%, 0)`);
    g.addColorStop(0.5, `hsla(${theme.friendly + 12}, 100%, 88%, ${a})`);
    g.addColorStop(1, `hsla(${theme.friendly}, 100%, 60%, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(f.x - w, 0, w * 2, this.shield.domeY(f.x));
    ctx.restore();
  }

  _fit() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    this.display.style.width = `${Math.floor(W * scale)}px`;
    this.display.style.height = `${Math.floor(H * scale)}px`;
  }
}

const game = new Game(document.getElementById('game'));
let last = performance.now();

function frame(now) {
  const raw = now - last;
  const dt = Math.min(raw / 1000, 1 / 30);
  last = now;
  game.quality.sample(raw);
  if (!game.paused) game.update(dt);
  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.game = game;
