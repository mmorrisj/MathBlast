// MathBlast.
//
// Fixed 1280x720 virtual resolution drawn straight into the visible canvas and
// letterboxed by CSS, so render cost is constant regardless of window size.

import { clamp, damp, rand, randInt, power } from './util.js';
import { theme, setThemeWave, setColorSafe, setReducedMotion } from './theme.js';
import { Audio } from './audio.js';
import { SkillTable, makeChoices } from './problems.js';
import { Profiles, Scores, cleanName, MAX_NAME } from './profiles.js';
import { TIERS, DEFAULT_TIER, tierById, descentRate, waveCount } from './difficulty.js';
import { Camera } from './fx/camera.js';
import { Particles } from './fx/particles.js';
import { Shockwaves } from './fx/shockwave.js';
import { Orbs } from './fx/orbs.js';
import { Post } from './render/post.js';
import { Starfield } from './render/starfield.js';
import { Shield, CX } from './entities/shield.js';
import { Projectile, Turret } from './entities/projectile.js';
import { makeBeast, makeBoss, isBossWave, SplitBeast } from './entities/beasts/index.js';
import { drawHud, drawTitle, drawGameOver, drawFocus, drawInterlude, drawHelp, choiceHitTest, setChoiceLayout, tierHitTest } from './ui/hud.js';
import { Quality } from './quality.js';
import { touchButtons, touchHitTest, drawTouchButtons, drawRotate } from './ui/touch.js';
import { drawProfiles, profileHitTest, nameButton, drawScores, drawLeaderboard, MAX_ROWS } from './ui/profile.js';

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
    this.profiles = new Profiles();
    this.scores = new Scores();
    this.skill = new SkillTable(this.profiles.activeId);
    this.quality = new Quality(new URLSearchParams(location.search).get('q'));

    // Coarse pointer means no keyboard: pick-an-answer layout, on-screen
    // buttons, and a landscape prompt when the phone is upright.
    this.touch = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    setChoiceLayout(this.touch);
    this.portrait = false;
    this.profileIndex = 0;
    this.tierIndex = Math.max(0, TIERS.findIndex(
      (x) => x.id === (this.profiles.active?.tier || DEFAULT_TIER)));
    this.naming = false;
    this.nameDraft = '';
    this.nameError = '';
    this.lastRun = null;

    // First visit asks who is playing; after that it goes straight in with the
    // last player, who is named on the title screen with ESC to switch.
    this.state = this.profiles.isEmpty ? 'profile' : 'title';
    this.time = 0;
    this.stateTime = 0;
    this.paused = false;
    this.help = false;
    this.board = false;      // the full top-20 screen
    this.danger = 0;
    this.inputMode = 'type';
    this.choices = [];
    this.choiceIndex = 0;

    const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(Boolean(mq && mq.matches));
    if (mq && mq.addEventListener) mq.addEventListener('change', (e) => setReducedMotion(e.matches));

    this.reset();
    if (this.touch) this._setInputMode('choose');
    this._bindInput();
    this._bindNameField();
    this._fit();
    window.addEventListener('resize', () => this._fit());
    if (window.visualViewport) {
      // A URL bar sliding away does not reliably fire window resize, so the
      // canvas would keep its old size until something else forced a refit.
      window.visualViewport.addEventListener('resize', () => this._fit());
      window.visualViewport.addEventListener('scroll', () => this._fit());
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.paused = true; });
  }

  get tier() { return TIERS[this.tierIndex] || tierById(DEFAULT_TIER); }

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
    this.manualTargetId = null;    // set when the player picks a beast themselves
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

      // Name entry owns the keyboard while it is open (the DOM field handles it).
      if (this.naming) return;

      if (this.state === 'profile') {
        const shown = Math.min(this.profiles.list.length, MAX_ROWS);
        if (e.key === 'ArrowUp') this.profileIndex = (this.profileIndex + shown) % (shown + 1);
        else if (e.key === 'ArrowDown') this.profileIndex = (this.profileIndex + 1) % (shown + 1);
        else if (e.key === 'Enter' || e.key === ' ') this._chooseProfile(this.profileIndex);
        else if (e.key === 'Delete' || e.key === 'Backspace') {
          const p = this.profiles.list[this.profileIndex];
          if (p) {
            this.profiles.remove(p.id);
            this.profileIndex = Math.max(0, Math.min(this.profileIndex, this.profiles.list.length));
          }
        } else if (e.key === 'h' || e.key === 'H') this.help = !this.help;
        else if (e.key === 't' || e.key === 'T') this.board = !this.board;
        return;
      }

      // Instructions and the board are reachable from anywhere, and swallow
      // other keys while open.
      if (e.key === 'h' || e.key === 'H') { this.help = !this.help; return; }
      if (this.help) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this.help = false;
        return;
      }
      if (e.key === 't' || e.key === 'T') { this.board = !this.board; return; }
      if (this.board) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this.board = false;
        return;
      }

      if (this.state === 'title') {
        if (e.key === 'ArrowLeft') this._setTier(this.tierIndex - 1);
        else if (e.key === 'ArrowRight') this._setTier(this.tierIndex + 1);
        else if (e.key === 'Enter' || e.key === ' ') this._begin();
        else if (e.key === 'c' || e.key === 'C') setColorSafe(!theme.colorSafe);
        else if (e.key === 'r' || e.key === 'R') setReducedMotion(!theme.reducedMotion);
        else if (e.key === 'Escape') { this.state = 'profile'; this.stateTime = 0; }
        return;
      }
      if (this.state === 'gameover') {
        if (e.key === 'Enter') this._begin();
        else if (e.key === 'Escape') { this.state = 'profile'; this.stateTime = 0; }
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

      // [ and ] switch target in either mode; the arrows do it too when they
      // are not already busy picking an answer.
      if (e.key === '[') { this._cycleTarget(-1); return; }
      if (e.key === ']') { this._cycleTarget(1); return; }
      if (e.key === 'ArrowUp') { this._cycleTarget(-1); return; }
      if (e.key === 'ArrowDown') { this._cycleTarget(1); return; }

      if (this.inputMode === 'choose') {
        if (e.key === 'ArrowLeft') this.choiceIndex = (this.choiceIndex + 3) % 4;
        else if (e.key === 'ArrowRight') this.choiceIndex = (this.choiceIndex + 1) % 4;
        else if (e.key === 'Enter') this._fire(this.choices[this.choiceIndex]);
        return;
      }

      if (e.key === 'ArrowLeft') { this._cycleTarget(-1); return; }
      if (e.key === 'ArrowRight') { this._cycleTarget(1); return; }

      // x and * both enter the multiplication sign, so a boulder's "? × ?"
      // question can actually be answered as a pair.
      const mult = e.key === 'x' || e.key === 'X' || e.key === '*';
      // A leading minus only, so "5-3" cannot be typed as if it were a sum.
      const minus = (e.key === '-' || e.key === '_') && this.input === '';
      if ((e.key >= '0' && e.key <= '9') || e.key === '/' || mult || minus) {
        if (this.input.length < 7) {
          this.input += minus ? '−' : (mult ? '×' : e.key);
          this.inputPulse = 1;
        }
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
      const rect = this.display.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const py = ((ev.clientY - rect.top) / rect.height) * H;

      if (this.help) { this.help = false; return; }
      if (this.board) { this.board = false; return; }

      // On-screen buttons sit above everything else.
      const btn = touchHitTest(px, py, touchButtons(this, W, H));
      if (btn) {
        if (btn === 'help') this.help = true;
        else if (btn === 'board') this.board = true;
        else if (btn === 'pause') this.paused = !this.paused;
        else if (btn === 'beam') this._fireBeam();
        return;
      }

      if (this.state === 'profile') {
        if (this.naming) {
          const b = nameButton(W, H);
          if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) this._confirmName();
          else if (this.nameField) this.nameField.focus();
          return;
        }
        const hit = profileHitTest(px, py, this.profiles.list.length, W);
        if (hit !== null) this._chooseProfile(hit);
        return;
      }
      if (this.state === 'title') {
        const tierHit = tierHitTest(px, py, W);
        if (tierHit >= 0) { this._setTier(tierHit); return; }
        this._begin();
        return;
      }
      if (this.state === 'gameover') { this._begin(); return; }
      if (this.paused) { this.paused = false; return; }

      if (this.inputMode === 'choose') {
        const hit = choiceHitTest(px, py, this.choices);
        if (hit >= 0) { this.choiceIndex = hit; this._fire(this.choices[hit]); return; }
      }
      // Anywhere else on the field: take aim at whatever was clicked.
      this._pickTargetAt(px, py);
    };
    window.addEventListener('pointerdown', pointer);
    // Touch implies no keyboard: switch to the pick-an-answer layout.
    window.addEventListener('touchstart', () => {
      this.touch = true;
      setChoiceLayout(true);
      this._fit();
      this._setInputMode('choose');
    }, { passive: true });
    window.addEventListener('gamepadconnected', () => this._setInputMode('choose'));
    this._bindAppShell();
  }

  // The handful of things a page has to do for itself that a native app gets
  // from the OS. All of them are best-effort: every API here is missing on some
  // browser, and none of them is worth an error if it is.
  _bindAppShell() {
    // 1. The screen must not dim while you are reading a problem. A wake lock
    //    is dropped whenever the tab is hidden, so it is re-taken on return.
    const wake = async () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      if (this.state !== 'playing') return;
      try { this.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* denied */ }
    };
    this._wake = wake;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake();
      // Losing focus mid-run should pause rather than let beasts land unseen.
      else if (this.state === 'playing') this.paused = true;
    });

    // 2. Full screen, then landscape. Installed from the manifest both are
    //    already set; in a browser tab neither is, and the browser's own bar
    //    sits over the top of the playfield until this succeeds.
    //
    //    Order matters. screen.orientation.lock() rejects unless the document
    //    is *already* fullscreen, so asking for the lock first -- which is what
    //    this did at first -- means it always fails.
    const el = document.documentElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    const isFull = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    let refusals = 0;

    const claim = () => {
      if (!this.touch || !request || isFull() || refusals >= 3) return;
      Promise.resolve(request.call(el, { navigationUI: 'hide' }))
        .then(() => {
          refusals = 0;
          if (screen.orientation && screen.orientation.lock) {
            return screen.orientation.lock('landscape');
          }
          return null;
        })
        .catch(() => { refusals++; });
    };
    // Deliberately not `once`. A single refusal used to leave the browser bar
    // over the game for the rest of the session; a tap that leaves fullscreen
    // has to be recoverable too. Three consecutive refusals means the browser
    // will not allow it at all, so stop asking.
    window.addEventListener('pointerup', claim);
    window.addEventListener('keydown', () => { claim(); wake(); });
    window.addEventListener('pointerdown', wake);
    // Leaving fullscreen changes the visible area; the canvas has to follow.
    document.addEventListener('fullscreenchange', () => this._fit());

    // 3. Android's back button. Installed, there is no browser chrome to go
    //    back to, so an unhandled back closes the app -- from the middle of a
    //    run. A spare history entry absorbs it and closes whatever is open.
    history.replaceState({ mathblast: 'root' }, '');
    history.pushState({ mathblast: 'shell' }, '');
    window.addEventListener('popstate', () => {
      // Push the entry straight back, or the next back press exits for real.
      history.pushState({ mathblast: 'shell' }, '');
      if (this.help) { this.help = false; return; }
      if (this.board) { this.board = false; return; }
      if (this.naming) { this._stopNaming(); return; }
      if (this.state === 'playing') { this.paused = !this.paused; return; }
      if (this.state === 'title') { this.state = 'profile'; this.stateTime = 0; }
    });
  }

  // A hidden DOM input carries name entry, so phones get the native keyboard
  // instead of a letter grid nobody wants to thumb through.
  _bindNameField() {
    const el = document.getElementById('nameField');
    if (!el) return;
    this.nameField = el;
    el.addEventListener('input', () => {
      this.nameDraft = cleanName(el.value);
      if (el.value !== this.nameDraft) el.value = this.nameDraft;
      this.nameError = '';
    });
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this._confirmName();
      else if (e.key === 'Escape') this._stopNaming();
    });
  }

  _startNaming() {
    this.naming = true;
    this.nameDraft = '';
    this.nameError = '';
    if (this.nameField) {
      this.nameField.value = '';
      this.nameField.style.display = 'block';
      this.nameField.focus();
    }
  }

  _stopNaming() {
    this.naming = false;
    this.nameError = '';
    if (this.nameField) {
      this.nameField.blur();
      this.nameField.style.display = 'none';
    }
  }

  _confirmName() {
    const name = cleanName(this.nameDraft);
    if (!name) { this.nameError = 'Please enter a name'; return; }
    const made = this.profiles.create(name);
    if (!made) { this.nameError = 'That name is already taken'; return; }
    this._stopNaming();
    this.skill.useProfile(this.profiles.activeId);
    this.profileIndex = this.profiles.list.findIndex((p) => p.id === made.id);
    this.state = 'title';
    this.stateTime = 0;
  }

  // The tier is remembered per player, since it tracks where they are.
  _setTier(i) {
    const n = TIERS.length;
    const next = ((i % n) + n) % n;
    if (next === this.tierIndex) return;
    this.tierIndex = next;
    const p = this.profiles.active;
    if (p) { p.tier = TIERS[next].id; this.profiles.save(); }
    this.audio.plate ? this.audio.plate() : this.audio.fire(640);
  }

  _chooseProfile(i) {
    const shown = Math.min(this.profiles.list.length, MAX_ROWS);
    if (i === 'new' || i === shown) { this._startNaming(); return; }
    const p = this.profiles.list[i];
    if (!p) return;
    this.profiles.select(p.id);
    this.skill.useProfile(p.id);
    this.profileIndex = i;
    this.tierIndex = Math.max(0, TIERS.findIndex((x) => x.id === (p.tier || DEFAULT_TIER)));
    this.state = 'title';
    this.stateTime = 0;
    this.audio.start();
  }

  _begin() {
    this.audio.start();
    this.audio.restart();
    if (this.state !== 'playing') {
      this.reset();
      this.state = 'playing';
      this.stateTime = 0;
      this._nextWave();
      if (this._wake) this._wake();
    }
  }

  // Nothing is being read once the run is over, so give the screen back.
  _releaseWake() {
    if (!this.wakeLock) return;
    const lock = this.wakeLock;
    this.wakeLock = null;
    lock.release().catch(() => { /* already gone */ });
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
        ? 'TAP or ◀ ▶ pick answer  ·  [ ] or click switch target  ·  ENTER fire  ·  SPACE overcharge  ·  TAB type'
        : '0-9 and / answer  ·  ENTER fire  ·  [ ] or click switch target  ·  SPACE overcharge  ·  TAB pick  ·  P pause';
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
      const prev = gp.buttons[4]?.pressed;
      const next = gp.buttons[5]?.pressed;
      if (this.state === 'playing') {
        if (prev && !this._gpPrev) this._cycleTarget(-1);
        if (next && !this._gpNext) this._cycleTarget(1);
      }
      this._gpPrev = prev; this._gpNext = next;
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

  // Step through the beasts left-to-right on screen.
  _cycleTarget(dir) {
    const list = this.beasts
      .filter((b) => b.alive && !b.locked)
      .sort((a, b) => a.x - b.x);
    if (list.length < 2) return;
    const i = list.indexOf(this.targetBeast);
    const next = list[((i < 0 ? 0 : i + dir) % list.length + list.length) % list.length];
    this._selectTarget(next);
  }

  // Click or tap a beast to take aim at it.
  _pickTargetAt(px, py) {
    const p = this.camera.screenToWorld(px, py, W, H);
    let best = null, bd = Infinity;
    for (const b of this.beasts) {
      if (!b.alive || b.locked) continue;
      const reach = Math.max(b.w, b.h) / 2 + 34;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < reach && d < bd) { bd = d; best = b; }
    }
    if (best) { this._selectTarget(best); return true; }
    return false;
  }

  _selectTarget(b) {
    if (!b || b === this.targetBeast) return;
    this.manualTargetId = b.id;
    this.targetBeast = b;
    this.input = '';
    this.inputPulse = 1;
    this._refreshChoices();
    this.audio.fire(b.x);
  }

  _fire(raw) {
    const t = this.targetBeast;
    if (!t || !raw) return;
    const correct = t.accepts(raw);
    const elapsed = performance.now() / 1000 - t.bornAt;

    // A first attempt to factor a prime is a lesson, not a mistake -- keep it
    // out of accuracy, the skill table and the mode shift.
    const freebie = !correct && t.prime && !t.revealed;
    if (t.a != null && t.b != null) this.skill.record(t.a, t.b, elapsed, correct);
    if (!freebie) {
      this.attempts++;
      if (correct) this.solved++;
      this.rollingAcc = this.rollingAcc * 0.82 + (correct ? 1 : 0) * 0.18;
      this.audio.setAccuracy(this.rollingAcc);
    }

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
      const b = makeBoss(this.tier, this.wave, CX + rand(200, -200), -140, 26 + this.wave);
      this.beasts.push(b);
      this.boss = b;
    } else {
      this.waveRemaining = waveCount(this.tier, this.wave);
      this.spawnTimer = 0.6;
    }
  }

  // The held breath between waves: everything cuts, the camera pulls back, and
  // a clean wave gets its chord and a repaired plate before the next punch-in.
  _endWave() {
    this.wavePhase = 'interlude';
    this.phaseTimer = INTERLUDE;
    this.interludeLen = INTERLUDE;
    this.lastPerfect = this.waveMisses === 0;
    this.audio.holdBeat(1.1);
    // The build is locked to a bar line and schedules its own drop, so the
    // interlude runs for exactly as long as the music needs rather than a
    // fixed 2.3s that lands wherever it lands.
    const untilDrop = this.audio.buildUp(INTERLUDE - 0.5);
    if (untilDrop > 0) {
      this.phaseTimer = untilDrop;
      this.interludeLen = untilDrop;
    }
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
    const speed = descentRate(this.tier, this.wave) + rand(10);
    this.beasts.push(makeBeast(this.tier, this.wave, this.skill, x, -80 - rand(120), speed));
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
    } else if (b.prime && !b.revealed) {
      // Discovering that a rock is prime should not cost anything. The first
      // attempt to factor one teaches instead of punishing: the rock reveals
      // itself, and the combo and shield are left alone.
      b.revealed = true;
      b.locked = false;
      b.hitFlash = 1;
      this.audio.charged();
      this.camera.shake(0.14);
      this.shockwaves.spawn(b.x, b.y, 0.45, { hue: 352, rings: 2, radius: 130 });
      this.particles.burst(b.x, b.y, 22, {
        hue: 352, speed: 260, life: 0.7, size: 3.6, stretch: 0.8,
      });
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
        this._endRun();
      }
    }
  }

  // Fold the finished run into the player's profile and the score table.
  _endRun() {
    this.state = 'gameover';
    this._releaseWake();
    this.stateTime = 0;
    this.audio.gameOver();
    const name = this.profiles.active ? this.profiles.active.name : 'PLAYER';
    const accuracy = this.attempts ? Math.round((this.solved / this.attempts) * 100) : 100;
    const beat = this.profiles.record({
      score: this.score, wave: this.wave, combo: this.bestCombo,
      solved: this.solved, attempts: this.attempts,
    });
    const place = this.scores.add({
      name, score: this.score, wave: this.wave, accuracy, combo: this.bestCombo,
      tier: this.tier.id,
    });
    this.lastRun = { place, beat, name, accuracy };
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

    if (this.state === 'profile') {
      this.stars.update(dt);
      return;
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

    // A beast the player picked themselves holds the turret until it dies or is
    // fired at; otherwise the turret falls back to whatever is most dangerous.
    let target = null;
    if (this.manualTargetId != null) {
      const held = this.beasts.find(
        (b) => b.id === this.manualTargetId && b.alive && !b.locked,
      );
      if (held) target = held;
      else this.manualTargetId = null;
    }
    if (!target) {
      for (const b of this.beasts) {
        if (!b.alive || b.locked) continue;
        // Bosses always take priority; otherwise the closest to doing damage.
        const score = (b.isBoss ? 1000 : 0) + b.progress(this.shield);
        if (!target || score > target._score) { target = b; target._score = score; }
      }
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
    if (this.touch && !this.portrait) drawTouchButtons(ctx, touchButtons(this, W, H), this.time);

    this.post.apply(this.out, {
      bloom: q.bloom ? 0.85 + this.danger * 0.3 : 0,
      aberration: q.aberration ? Math.max(0, this.danger - 0.5) * 0.9 + this.camera.slowmo * 0.25 : 0,
      desat: q.desat ? this.camera.slowmo * 0.7 : 0,
      vignette: 0.5 + this.danger * 0.25,
    });

    if (this.state === 'playing') {
      if (q.desat) drawFocus(this.out, this, W, H, this.camera.slowmo, this.camera);
      if (this.wavePhase === 'interlude') {
        drawInterlude(this.out, this, W, H, 1 - this.phaseTimer / (this.interludeLen || INTERLUDE));
      }
    }
    // Instructions replace the title/game-over overlay rather than stacking on
    // top of it -- a 94%-opaque scrim still lets big glowing text read through.
    if (this.help) {
      drawHelp(this.out, W, H, this);
    } else if (this.board) {
      drawLeaderboard(this.out, this, W, H);
    } else if (this.state === 'profile') {
      drawProfiles(this.out, this, W, H, this.time);
    } else {
      if (this.state === 'title') drawTitle(this.out, W, H, this.time, this);
      if (this.state === 'gameover') drawGameOver(this.out, this, W, H, this.stateTime);
    }

    // Overrides everything: there is nothing useful to show sideways.
    if (this.portrait) drawRotate(this.out, W, H, this.time);
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
    // window.innerHeight is the *layout* viewport, which on a phone includes
    // the strip behind the browser's URL bar. Sizing to it makes the canvas
    // taller than what is on screen and pushes the top of the playfield --
    // score, cores, the beasts you most need to see -- underneath the bar.
    // visualViewport is the part actually visible.
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    // A 16:9 playfield on an upright phone is too small to read, so ask for
    // landscape rather than rendering something unplayable.
    this.portrait = this.touch && vh > vw;
    const scale = Math.min(vw / W, vh / H);
    this.display.style.width = `${Math.floor(W * scale)}px`;
    this.display.style.height = `${Math.floor(H * scale)}px`;
    if (this.nameField) {
      // Keep the invisible field over the canvas so focus behaves.
      this.nameField.style.width = `${Math.floor(W * scale * 0.36)}px`;
    }
  }
}

const game = new Game(document.getElementById('game'));
let last = performance.now();

function frame(now) {
  const raw = now - last;
  const dt = Math.min(raw / 1000, 1 / 30);
  last = now;
  game.quality.sample(raw);
  if (!game.paused && !game.help) game.update(dt);
  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.game = game;
