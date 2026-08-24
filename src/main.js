// MathBlast.
//
// Fixed 1280x720 virtual resolution drawn straight into the visible canvas and
// letterboxed by CSS, so render cost is constant regardless of window size.

import { clamp, damp, rand, randInt, power, TAU, easeOutCubic } from './util.js';
import { theme, setThemeWave, setColorSafe, setReducedMotion } from './theme.js';
import { Audio } from './audio.js';
import { SkillTable, makeChoices } from './problems.js';
import { Profiles, Scores, cleanName, MAX_NAME } from './profiles.js';
import { Progress } from './progress.js';
import { TIERS, DEFAULT_TIER, tierById, descentRate, waveCount } from './difficulty.js';
import { plan as planFor, pickPlan, paceWave } from './adaptive.js';
import {
  RUN_WAVES, TRACKS, PICKER, trackById, arcadePlan, practicePlan, unlockedAt,
  ARCADE_TIER, PRACTICE_TIER, bossKind,
} from './modes.js';
import { Camera } from './fx/camera.js';
import { Particles } from './fx/particles.js';
import { Shockwaves } from './fx/shockwave.js';
import { Orbs } from './fx/orbs.js';
import { Post } from './render/post.js';
import { Starfield } from './render/starfield.js';
import { Shield, CX, SURGE_LAND } from './entities/shield.js';
import { Projectile, Turret } from './entities/projectile.js';
import { makeBeast, SplitBeast } from './entities/beasts/index.js';
import { bossSteps } from './entities/beasts/boss.js';
import { drawHud, drawTitle, drawGameOver, drawVictory, drawFocus, drawInterlude, drawHelp, choiceHitTest, setChoiceLayout, tierHitTest, modeHitTest, trackHitTest, chipHitTest } from './ui/hud.js';
import { Quality } from './quality.js';
import { touchButtons, touchHitTest, drawTouchButtons, drawRotate } from './ui/touch.js';
import { drawProfiles, profileHitTest, nameButton, backButton, drawScores, drawLeaderboard, MAX_ROWS } from './ui/profile.js';
import { drawStarChart } from './ui/starchart.js';
import { drawCodex, codexHitTest, codexArtHit, codexCount } from './ui/codex.js';
import { ENTRIES as CODEX } from './codex.js';
import { drawProgress } from './ui/progress.js';
import { drawMenu, menuItems, menuHitTest } from './ui/menu.js';
import { makeBoss, bossOrigin, isBossWave, isLeviathan, DemandBeast } from './entities/bosses/index.js';
import { dayKey } from './progress.js';

const W = 1280;
const H = 720;
const INTERLUDE = 2.3;
// The finale runs outward, hangs, then falls back in. Explosion first: a
// collapse with nothing to collapse reads as a shrug.
const NOVA_OUT = 1.05;     // the bright half
const NOVA_HANG = 0.35;    // debris slowing, hanging there
const NOVA_IN = 0.85;      // and falling back into a point
// Where a beast comes through, and how long the seam takes to open. The old
// spawn was y = -80 to -200 -- off screen, invisible for one to two and a half
// seconds, and not clear of the HUD scrim for three to eight. On screen from
// the first frame instead, with the whole descent still ahead of it.
// Low enough that the whole seam fits on screen -- at 62 the top third of it
// was cut off by the edge, which read as a beam coming from somewhere rather
// than a door opening.
const ARRIVE_Y = 96;
const WARP = 0.42;

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
    this.progress = new Progress(this.profiles.activeId);
    this.quality = new Quality(new URLSearchParams(location.search).get('q'));

    // Coarse pointer means no keyboard: pick-an-answer layout, on-screen
    // buttons, and a landscape prompt when the phone is upright.
    this.touch = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    setChoiceLayout(this.touch);
    this.portrait = false;
    this.profileIndex = 0;
    this.tierIndex = Math.max(0, TIERS.findIndex(
      (x) => x.id === (this.profiles.active?.tier || DEFAULT_TIER)));
    // 'tier' (endless, pick a difficulty) | 'arcade' | 'practice'.
    this.mode = this.profiles.active?.mode || 'tier';
    this.trackId = this.profiles.active?.track || TRACKS[0].id;
    this.trackIndex = Math.max(0, TRACKS.findIndex((t) => t.id === this.trackId));
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
    this.boardMode = null;   // which mode's table it is showing
    this.sky = false;        // the star chart
    this.report = false;     // the progress page, for a parent
    this.codex = false;      // the field guide to every challenge
    this.codexIndex = 0;
    this.codexShown = null;  // the live example currently on the page
    this.menu = false;
    this.menuIndex = 0;
    // Recomputed at each wave boundary rather than per spawn, so a wave is a
    // coherent set rather than drifting under the player mid-wave.
    this.plan = [];
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

  // The tier drives descent speed, wave size and the ranges the generators draw
  // from. Arcade and Practice bring their own rather than borrowing one of the
  // three: Arcade has to open gently enough for wave-one addition and finish
  // hard enough to be the ultimate challenge, which no single tier does.
  get tier() {
    if (this.mode === 'arcade') return ARCADE_TIER;
    if (this.mode === 'practice') return PRACTICE_TIER;
    return TIERS[this.tierIndex] || tierById(DEFAULT_TIER);
  }

  // Fifty waves and a finish line, versus endless. Only a run with an ending
  // can be won, and only a won run has a clear time worth ranking.
  get timed() { return this.mode === 'arcade' || this.mode === 'practice'; }
  get finalWave() { return RUN_WAVES; }

  // What this run is called on a board and a victory screen.
  get modeLabel() {
    if (this.mode === 'arcade') return 'ARCADE';
    if (this.mode === 'practice') return trackById(this.trackId).name;
    return this.tier.name;
  }
  // The key a board is filed under: every practice track gets its own, since a
  // fifty-wave addition run and a fifty-wave fractions run are not the same
  // race.
  get modeKey() {
    if (this.mode === 'arcade') return 'arcade';
    if (this.mode === 'practice') return `practice:${this.trackId}`;
    return this.tier.id;
  }

  reset() {
    this.shield = new Shield();
    this.turret = new Turret(CX, this.shield.domeY(CX) - 26);
    this._surging = false;
    this.beasts = [];
    this.shots = [];
    this.warps = [];
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
    this.boss = null;
    this.bossBlast = null;
    this.camera.noStop = false;
    this.phaseTimer = 0;
    this.waveMisses = 0;
    this.waveOpenT = 0;
    // Seconds actually spent playing. Paused, in a menu, on the title screen or
    // with the tab hidden does not count -- otherwise the board would rank
    // whoever left the tab open the least, not whoever was quickest.
    this.runTime = 0;
    this.won = false;
    this.unlocks = [];
    this.unlockBanner = 0;
    this.lastPerfect = false;
    this.lastStandT = 0;          // 0..1 ramp into the one-core state
    this.masteredFx = null;       // { text, t } when a fact just crossed
    this.spawnTimer = 0;
    this.waveRemaining = 0;
    this.targetBeast = null;
    this.chainFx = [];             // bolts drawn between chained kills
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
        else if (e.key === 's' || e.key === 'S') this.sky = !this.sky;
        else if (e.key === 'g' || e.key === 'G') this.report = !this.report;
        return;
      }

      if (this.menu) {
        const items = menuItems(this);
        if (e.key === 'ArrowUp') this.menuIndex = (this.menuIndex + items.length - 1) % items.length;
        else if (e.key === 'ArrowDown') this.menuIndex = (this.menuIndex + 1) % items.length;
        else if (e.key === 'Enter' || e.key === ' ') this._menuAction(items[this.menuIndex].id);
        else if (e.key === 'Escape' || e.key === 'Tab') this._closeMenu();
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
        // Each mode keeps its own table, so the board has to be steerable.
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const modes = this.scores.modes();
          if (modes.length > 1) {
            const i = Math.max(0, modes.indexOf(this.boardMode));
            const step = e.key === 'ArrowRight' ? 1 : -1;
            this.boardMode = modes[(((i + step) % modes.length) + modes.length) % modes.length];
            this._tick();
          }
          return;
        }
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this.board = false;
        return;
      }
      if (e.key === 's' || e.key === 'S') { this.sky = !this.sky; return; }
      if (this.sky) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this.sky = false;
        return;
      }
      if (e.key === 'g' || e.key === 'G') { this.report = !this.report; return; }
      if (this.report) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this.report = false;
        return;
      }
      // K, not X: x and * type the multiplication sign so a factor rock's
      // "? × ?" can be answered as a pair, and stealing it here would break
      // answering mid-run. Reachable during a run as well as from the title,
      // so a player stuck on the thing that just beat them can go and read
      // about it.
      if (e.key === 'k' || e.key === 'K') {
        this.codex ? (this.codex = false) : this._openCodex();
        return;
      }
      if (this.codex) {
        if (e.key === 'ArrowLeft') { this._codexMove(-1); return; }
        if (e.key === 'ArrowRight') { this._codexMove(1); return; }
        if (e.key === 'r' || e.key === 'R') { this._codexRoll(); this._tick(); return; }
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this.codex = false;
        return;
      }

      if (this.state === 'title') {
        // Up and down move between modes; left and right move within whatever
        // that mode still has to choose.
        if (e.key === 'ArrowUp') this._setMode(-1);
        else if (e.key === 'ArrowDown') this._setMode(1);
        else if (e.key === 'ArrowLeft') this._setChoice(-1);
        else if (e.key === 'ArrowRight') this._setChoice(1);
        else if (e.key === 'Enter' || e.key === ' ') this._begin();
        else if (e.key === 'c' || e.key === 'C') setColorSafe(!theme.colorSafe);
        else if (e.key === 'r' || e.key === 'R') setReducedMotion(!theme.reducedMotion);
        else if (e.key === 'Escape') { this.state = 'profile'; this.stateTime = 0; }
        return;
      }
      if (this.state === 'gameover' || this.state === 'victory') {
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

      if (e.key === 'Escape') {
        if (this.input) { this.input = ''; return; }
        this._openMenu();
        return;
      }

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
      if (this.sky) { this.sky = false; return; }
      if (this.report) { this.report = false; return; }
      if (this.codex) {
        // The dots jump, the picture rerolls, anything else closes -- so there
        // is always a way out without hunting for a button.
        const dot = codexHitTest(px, py, W, H);
        if (dot >= 0) { this._codexTo(dot); return; }
        if (codexArtHit(px, py)) { this._codexRoll(); this._tick(); return; }
        this.codex = false;
        return;
      }
      if (this.menu) {
        const hit = menuHitTest(px, py, this, W);
        // A tap outside the list closes it, so there is always a way out even
        // if none of the entries is what was wanted.
        if (hit) this._menuAction(hit); else this._closeMenu();
        return;
      }

      // On-screen buttons sit above everything else.
      const btn = touchHitTest(px, py, touchButtons(this, W, H));
      if (btn) {
        if (btn === 'menu') this._openMenu();
        else if (btn === 'pause') this.paused = !this.paused;
        else if (btn === 'beam') this._fireBeam();
        return;
      }

      if (this.state === 'profile') {
        if (this.naming) {
          const b = nameButton(W, H);
          const back = backButton(W, H);
          if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) this._confirmName();
          else if (px >= back.x && px <= back.x + back.w && py >= back.y && py <= back.y + back.h) {
            this._stopNaming();
          } else if (this.nameField) this.nameField.focus();
          return;
        }
        const hit = profileHitTest(px, py, this.profiles.list.length, W);
        if (hit !== null) this._chooseProfile(hit);
        return;
      }
      if (this.state === 'title') {
        // Mode first: its row sits above the others and a tap there must not
        // fall through to starting a run.
        const modeHit = modeHitTest(px, py, W);
        if (modeHit >= 0) { this._pickMode(PICKER[modeHit].id); return; }
        if (this.mode === 'tier') {
          const tierHit = tierHitTest(px, py, W);
          if (tierHit >= 0) { this._setTier(tierHit); return; }
        } else if (this.mode === 'practice') {
          const trackHit = trackHitTest(px, py, W);
          if (trackHit >= 0) { this._setTrack(trackHit); return; }
        }
        if (this.touch) {
          // Before the tap-anywhere-to-play fallback, or a chip would start a
          // run rather than open what it says.
          const chip = chipHitTest(px, py, W);
          if (chip) { this._menuAction(chip); return; }
        }
        this._begin();
        return;
      }
      if (this.state === 'gameover' || this.state === 'victory') { this._begin(); return; }
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
      if (this.menu) { this._closeMenu(); return; }
      if (this.help) { this.help = false; return; }
      if (this.board) { this.board = false; return; }
      if (this.sky) { this.sky = false; return; }
      if (this.report) { this.report = false; return; }
      if (this.naming) { this._stopNaming(); return; }
      // Back mid-run opens the way out rather than only pausing: on a phone
      // this is the gesture a player will reach for to leave.
      if (this.state === 'playing') { this._openMenu(); return; }
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
    this._tick();
  }

  // Mode and track are remembered per player too: what someone is working on
  // is as much a part of where they are as which tier they picked.
  _pickMode(id) {
    if (this.mode === id) return;
    this.mode = id;
    // The plan has to follow the mode, or the title screen keeps showing the
    // last mode's mix under the new mode's name.
    this.plan = this._planFor(Math.max(1, this.wave));
    const p = this.profiles.active;
    if (p) { p.mode = id; this.profiles.save(); }
    this._tick();
  }

  _setTrack(i) {
    const n = TRACKS.length;
    const next = ((i % n) + n) % n;
    if (next === this.trackIndex) return;
    this.trackIndex = next;
    this.trackId = TRACKS[next].id;
    const p = this.profiles.active;
    if (p) { p.track = this.trackId; this.profiles.save(); }
    this._tick();
  }

  _setMode(step) {
    const n = PICKER.length;
    const i = Math.max(0, PICKER.findIndex((m) => m.id === this.mode));
    this._pickMode(PICKER[(((i + step) % n) + n) % n].id);
  }

  // Left and right mean whatever the current mode still has to choose.
  _setChoice(step) {
    if (this.mode === 'tier') this._setTier(this.tierIndex + step);
    else if (this.mode === 'practice') this._setTrack(this.trackIndex + step);
  }

  _tick() { this.audio.plate ? this.audio.plate() : this.audio.fire(640); }

  // --- the codex ----------------------------------------------------------

  // Build the example for the entry now on screen. Called on open, on every
  // move, and on reroll -- the page holds no state of its own beyond which
  // entry it is looking at.
  _codexRoll() {
    const entry = CODEX[clamp(this.codexIndex, 0, CODEX.length - 1)];
    try {
      this.codexShown = entry.make();
    } catch {
      // An example that cannot be built must not take the page down with it.
      this.codexShown = { thing: null, steps: ['(could not build an example)'] };
    }
  }

  _openCodex() {
    this.codex = true;
    this._codexRoll();
  }

  _codexMove(step) {
    const n = codexCount();
    this.codexIndex = (((this.codexIndex + step) % n) + n) % n;
    this._codexRoll();
    this._tick();
  }

  _codexTo(i) {
    if (i === this.codexIndex) { this._codexRoll(); return; }
    this.codexIndex = clamp(i, 0, codexCount() - 1);
    this._codexRoll();
    this._tick();
  }

  _chooseProfile(i) {
    const shown = Math.min(this.profiles.list.length, MAX_ROWS);
    if (i === 'new' || i === shown) { this._startNaming(); return; }
    const p = this.profiles.list[i];
    if (!p) return;
    this.profiles.select(p.id);
    this.skill.useProfile(p.id);
    this.progress.useProfile(p.id);
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
      this.progress.startRun();
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
      .filter((b) => b.ready && !b.locked)
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
      // Not clickable while it is still closing -- it is drawn small, and a
      // full-size hit box around a quarter-size shape catches taps aimed at
      // whatever is behind it.
      if (!b.ready || b.locked) continue;
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
    // The freebie is excluded here too, or a parent's page would show a miss
    // for the one attempt the game deliberately does not count as one.
    if (!freebie) this.progress.record(t.concept, t.level || 0, correct, elapsed);
    if (t.a != null && t.b != null) {
      // The skill table has always known when a fact tipped over into being
      // known. Saying so is most of why anyone would care that it tracks.
      const crossed = this.skill.record(t.a, t.b, t.factOp, elapsed, correct);
      if (crossed) {
        this.masteredFx = { text: `${t.a} ${t.factOp} ${t.b}`, t: 0 };
        this.audio.charged();
        this.particles.burst(t.x, t.y, 26, {
          hue: theme.friendly, speed: 320, life: 1, size: 3.2, stretch: 1.1,
        });
      }
    }
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
    // The Remainder needs the divisor that was actually fired, not the
    // canonical answer -- any of several is right, and which one it was is
    // what the encounter records.
    t.lastValue = parseInt(raw, 10);

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
    // Past the last wave of a timed run there is no next wave -- there is a
    // win. This is the only way out of the game that is not dying.
    if (this.timed && this.wave >= this.finalWave) { this._win(); return; }
    this.wave++;
    this.plan = this._planFor(this.wave);
    // What this wave brings in that the last one did not. Arcade gates a new
    // concept behind each boss, and an unannounced one is just an unexplained
    // difficulty spike.
    this.unlocks = this.mode === 'arcade' ? unlockedAt(this.wave) : [];
    if (this.unlocks.length && this.wave > 1) this.unlockBanner = 3.4;
    setThemeWave(this.wave);
    this.audio.setWave(this.wave);
    this.waveBanner = 2.2;
    this.waveMisses = 0;
    this.waveOpenT = 1.5;
    this.wavePhase = 'active';
    this.boss = null;
    this.bossBanner = 0;
    // Every fifth wave is an encounter. The tens are Leviathans -- the camera
    // pulls right back and the fight is a set piece; the fives are Wardens,
    // one idea and over quickly. A boss arrives roughly every three and a half
    // minutes, so making all ten full spectacles would turn a math game into a
    // boss rush.
    if (isBossWave(this.wave)) {
      this.wavePhase = 'boss';
      this.waveRemaining = 0;
      this.boss = makeBoss(this.wave, CX, bossOrigin(this.wave), this.skill);
      this.bossApi = this._bossApi();
      this.bossBanner = 2.6;
      // Hitstop and slow motion are suppressed for the duration: a boss fight
      // should not keep stopping to admire itself.
      this.camera.noStop = true;
      this.waveBanner = isLeviathan(this.wave) ? 3.2 : 2.4;
      this.audio.boss();
      this.camera.shake(isLeviathan(this.wave) ? 1.2 : 0.7);
    } else {
      this.waveRemaining = waveCount(this.tier, this._paceWave());
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
      this.shield.healScar();
      this.shield.flash = 1;
      if (p) this.particles.burst(p.x, p.y, 30, { hue: theme.friendly, speed: 240, life: 0.9, size: 4 });
      this.shockwaves.spawn(CX, this.shield.domeY(CX), 1.1, { hue: theme.friendly, split: 0.4 });
      this.score += 250 + this.wave * 60;
    }
  }

  // Dynamic has no ramp of its own: it paces off the difficulty of the
  // material currently in rotation rather than off the wave number alone.
  // Which weighted list of {id, level} this wave spawns from. Three modes, one
  // shape -- so nothing downstream of here knows which mode is running.
  _planFor(wave) {
    if (this.mode === 'arcade') return arcadePlan(wave);
    if (this.mode === 'practice') return practicePlan(this.trackId, wave);
    if (this.tier.dynamic) return planFor(this.progress, dayKey());
    return [];
  }

  // A planned run borrows the wave number its material corresponds to, so a
  // wave of two-digit addition does not fall at the speed of single digits.
  _paceWave() {
    return this.plan.length ? paceWave(this.plan, this.wave) : this.wave;
  }

  _openMenu() {
    if (this.menu) return;
    this.menu = true;
    this.menuIndex = 0;
    // Remember whether the run was already paused, so closing the menu puts it
    // back the way it was rather than always resuming.
    this._wasPaused = this.paused;
    if (this.state === 'playing') this.paused = true;
  }

  _closeMenu() {
    this.menu = false;
    this.paused = this._wasPaused || false;
  }

  // Everything an encounter is allowed to reach. Bosses are directors: they
  // never touch scoring, difficulty or the ledger, they just ask for problems
  // and let them go. Built once per boss wave rather than per frame.
  _bossApi() {
    return {
      wave: this.wave,
      // A problem from the current curriculum, held in place. The Kraken's
      // arms and the Echo's fallback both come from here, which is why
      // neither has to know anything about tiers or the adaptive plan.
      curriculum: (x, y) => {
        const pick = this.plan.length ? pickPlan(this.plan) : null;
        const b = makeBeast(this.tier, this.wave, this.skill, x, y, 0, pick);
        b.attached = true;
        b.speed = 0;
        this.beasts.push(b);
        return b;
      },
      // A problem the boss made up itself.
      demand: (spec, x, y) => {
        const b = new DemandBeast(spec, x, y, 0);
        b.attached = true;
        this.beasts.push(b);
        return b;
      },
      // Let one go at the planet.
      release: (b, speed) => {
        b.attached = false;
        b.charging = 0;
        b.launched = true;
        b.speed = speed;
      },
      // The boss got a hit in: the same cost as letting something land.
      hurt: (x = this.boss ? this.boss.x : CX) => {
        this.combo = 0;
        this.waveMisses++;
        this.audio.wrong(x);
        this.camera.shake(0.5);
        const plate = this.shield.crackPlate(x);
        if (plate) {
          this.particles.burst(plate.x, plate.y, 16, {
            hue: theme.hostile, speed: 240, life: 0.6, size: 4,
          });
        }
      },
      // A leftover, coming at you. The Remainder makes these out of your own
      // bad guesses, which is the whole lesson of the encounter.
      fragment: (x) => {
        const pick = this.plan.length ? pickPlan(this.plan) : null;
        const speed = descentRate(this.tier, this._paceWave()) * 1.5;
        this.beasts.push(
          makeBeast(this.tier, this.wave, this.skill, clamp(x, 120, W - 120), -70, speed, pick));
      },
      // The tier's own equation curriculum, for the Balance.
      equation: () => bossSteps(bossKind(this.tier, this.wave), this.wave),
    };
  }

  // The shot sets off a supernova, and a supernova is not the end of the star.
  // It burns outward, slows, falls back into a point, and leaves a remnant --
  // which is the thing worth collecting. A plain explosion scatters and is
  // over; this one leaves something behind.
  _killBoss(k) {
    k.kill();
    this.score += 500 + this.wave * 120;
    const rem = k.remnant;
    this.bossBlast = { x: k.x, y: k.y, t: 0, phase: 'out', remnant: rem };
    this.progress.boss(k.title);

    this.shockwaves.spawn(k.x, k.y, 3.4, { hue: rem.hue, rings: 5, radius: 620 });
    this.shockwaves.spawn(k.x, k.y, 2.4, { hue: 48, rings: 3, radius: 420 });
    // Long-lived and low-drag, because all of this has to still be in the air
    // when the collapse starts pulling it back.
    this.particles.burst(k.x, k.y, 240, {
      hue: rem.hue + 6, speed: 760, life: 2.6, size: 6, grav: 0, drag: 1.1, stretch: 1.5,
    });
    this.particles.burst(k.x, k.y, 110, {
      hue: 44, speed: 420, life: 2.8, size: 8, grav: 0, drag: 0.9, stretch: 0.9,
    });
    this.particles.burst(k.x, k.y, 60, {
      hue: k.hue, speed: 520, life: 2.9, size: 5, grav: 0, drag: 1,
      glyphs: ['×', '=', '+', '÷', rem.glyph],
    });
    this.camera.shake(2.2);
    this.camera.punchIn(1.06, 0, 0);
    this.audio.supernova(k.x);
  }

  // What is left once the debris has fallen back in. Each boss leaves its own
  // mark, so the trophies on the progress page are ten different things rather
  // than ten copies of one.
  _remnant(b) {
    const rem = b.remnant || { glyph: '∞', hue: 188 };
    this.orbs.spawnInfinity(b.x, b.y, (x) => this.shield.domePoint(x), rem);
    this.shockwaves.spawn(b.x, b.y, 1.2, { hue: rem.hue, rings: 2, radius: 200 });
    this.camera.shake(0.8);
    this.audio.charged();
  }

  // Spawning happens in two beats: a seam of light opens where something is
  // about to arrive, and the beast comes through it.
  //
  // The seam is the half that answers "I never see them appear". Even a player
  // fast enough to clear the board between arrivals sees the door open, so the
  // field reads as a place things come from rather than one where they turn up
  // behind your back.
  _spawn() {
    const x = clamp(rand(W - 160, 160), 120, W - 120);
    this.warps.push({ x, t: 0 });
    this.waveRemaining--;
  }

  // The seam finished opening: put the beast through it, on screen.
  _emerge(x) {
    const speed = descentRate(this.tier, this._paceWave()) + rand(10);
    const pick = this.plan.length ? pickPlan(this.plan) : null;
    // ARRIVE_Y, not -80: high enough to leave the whole descent ahead of it,
    // low enough to be on screen from its first frame.
    const b = makeBeast(this.tier, this.wave, this.skill, x, ARRIVE_Y, speed, pick);
    // The one place that opts a beast into the arrival: it came through a seam,
    // so it closes from far off.
    b.arriveT = 0;
    this.beasts.push(b);
    this.shockwaves.spawn(x, ARRIVE_Y, 0.5, { hue: theme.hostile, rings: 2, radius: 120 });
    this.particles.burst(x, ARRIVE_Y, 14, {
      hue: theme.hostile + 20, speed: 190, life: 0.5, size: 3, stretch: 1.2,
    });
    this.audio.warp ? this.audio.warp(x) : null;
  }

  // --- resolution --------------------------------------------------------

  // Everything that happens when a beast is taken apart. `pw` scales the whole
  // impact: ring count, debris, orb payout, hitstop, shake and the kill tone.
  // Solving a beast takes out its neighbours whose answers share a factor with
  // it. The only tactic the game had was "answer fast"; this makes noticing
  // that 6 and 24 are related worth something, which is the actual
  // mathematical skill rather than the typing speed.
  //
  // Chained beasts pay 40% and do not touch the combo, accuracy or the skill
  // table -- the player did not answer them.
  _chain(from) {
    const v = Number(from.answerText);
    if (!Number.isFinite(v) || v < 2) return;

    // Both sides have to be at least two, or every beast divides every other
    // and the whole field goes off at once.
    const related = (o) => {
      if (o === from || !o.alive || o.locked || o.stages) return false;
      const w = Number(o.answerText);
      if (!Number.isFinite(w) || w < 2) return false;
      const lo = Math.min(v, w);
      const hi = Math.max(v, w);
      return hi % lo === 0;
    };

    // Everything chained shares a factor with the answer that was *typed*,
    // not with the previous link -- "all the ones related to what I solved" is
    // a rule a nine-year-old can hold; a propagating one is not. `src` only
    // orders them by distance so the bolt hops to the nearest each time.
    // Nearest first, and a longer chain the better the streak is going.
    const reach = 2 + Math.min(2, Math.floor(this.combo / 6));
    let src = from;
    for (let n = 0; n < reach; n++) {
      const pool = this.beasts.filter(related);
      if (!pool.length) return;
      pool.sort((p, q) => Math.hypot(p.x - src.x, p.y - src.y) - Math.hypot(q.x - src.x, q.y - src.y));
      const hit = pool[0];
      const pw = power(hit.magnitude);
      this.chainFx.push({ ax: src.x, ay: src.y, bx: hit.x, by: hit.y, t: 0, life: 0.34 });
      this.score += Math.round((40 + hit.magnitude) * 0.4);
      this.audio.chain(hit.x, n);
      this._destroy(hit, pw * 0.8, true);
      this.camera.shake(0.12);
      src = hit;
    }
  }

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
        this._chain(b);
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
      // A wrong answer against one of the boss's own demands is information it
      // may want: the Cipher turns whichever tumblers the guess satisfies, and
      // the Remainder breaks off the leftover and sends it at you.
      if (this.boss && this.boss.alive && b.attached) {
        this.boss.onWrong(shot.value, this.bossApi);
      }
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
    this.progress.landed(b.concept, b.level || 0);
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
      // Down to the last core is a moment, not another notch on a gradient.
      if (this.cores === 1) {
        this.camera.stop(0.14);
        this.camera.shake(1.5);
        this.audio.lastStand();
      }
      this.camera.stop(0.1);
      this.particles.burst(b.x, y + 20, Math.round(60 + pw * 50), {
        hue: 20, speed: 500 + pw * 260, life: 1.4, size: 6, grav: 260, stretch: 1.2,
      });
      if (this.cores <= 0) {
        this._endRun();
      }
    }
  }

  // Every way out of the game goes through here, so a run can never be
  // abandoned without its score being folded in.
  _menuAction(id) {
    switch (id) {
      case 'resume': this._closeMenu(); break;
      case 'play': this._closeMenu(); this._begin(); break;
      case 'board': this._closeMenu(); this.board = true; break;
      case 'sky': this._closeMenu(); this.sky = true; break;
      case 'report': this._closeMenu(); this.report = true; break;
      case 'help': this._closeMenu(); this.help = true; break;
      case 'codex': this._closeMenu(); this._openCodex(); break;
      case 'mute': this.audio.toggleMute(); break;
      case 'quit':
        this._closeMenu();
        if (this.state === 'playing') this._endRun();
        break;
      case 'player':
        this._closeMenu();
        // You cannot carry on as somebody else, so switching ends the run --
        // and it ends it properly, with the score recorded.
        if (this.state === 'playing') this._endRun();
        this.state = 'profile';
        this.stateTime = 0;
        break;
      default: break;
    }
  }

  // Fifty waves, all ten bosses, still alive. The only ending in the game that
  // is not a death, and the whole reason the timed modes exist.
  _win() {
    this.won = true;
    this.beasts = [];
    this.boss = null;
    this.bossBlast = null;
    this.camera.noStop = false;
    this.camera.release();
    this.audio.victory();
    this._record('victory');
  }

  // Fold the finished run into the player's profile and the score table.
  _endRun() {
    this.boss = null;
    this.bossBlast = null;
    this.camera.noStop = false;
    this.audio.gameOver();
    this._record('gameover');
  }

  _record(state) {
    this.state = state;
    this._releaseWake();
    this.stateTime = 0;
    const name = this.profiles.active ? this.profiles.active.name : 'PLAYER';
    const accuracy = this.attempts ? Math.round((this.solved / this.attempts) * 100) : 100;
    const beat = this.profiles.record({
      score: this.score, wave: this.wave, combo: this.bestCombo,
      solved: this.solved, attempts: this.attempts,
    });
    // The clock only means something on a run that had a finish line, and only
    // a finished one is ranked by it.
    const place = this.scores.add({
      name, score: this.score, wave: this.wave, accuracy, combo: this.bestCombo,
      tier: this.tier.id, mode: this.modeKey, seconds: this.timed ? this.runTime : 0,
      won: this.won,
    });
    this.lastRun = {
      place, beat, name, accuracy, won: this.won,
      seconds: this.runTime, mode: this.modeKey, label: this.modeLabel,
    };
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
    if (this.bossBlast) {
      const b = this.bossBlast;
      b.t += dtReal;
      if (b.phase === 'out' && b.t >= NOVA_OUT) { b.phase = 'hang'; b.t = 0; }
      else if (b.phase === 'hang' && b.t >= NOVA_HANG) { b.phase = 'in'; b.t = 0; }
      else if (b.phase === 'in') {
        // The well opens: what was thrown out is dragged back, harder as it
        // gets closer to forming.
        const k = clamp(b.t / NOVA_IN, 0, 1);
        this.particles.attract(b.x, b.y, 900 + k * 5200, dtReal, 1100);
        if (b.t >= NOVA_IN) { this._remnant(b); this.bossBlast = null; }
      } else if (b.phase === 'hang') {
        // Hanging: just enough pull to stop it dispersing before the collapse.
        this.particles.attract(b.x, b.y, 240, dtReal, 1100);
      }
    }
    // The remnant bends what it passes on the way down.
    for (const o of this.orbs.list) {
      if (o.infinity) this.particles.attract(o.x, o.y, 1500, dtReal, 300);
    }
    if (this.chainFx.length) {
      for (const c of this.chainFx) c.t += dtReal;
      this.chainFx = this.chainFx.filter((c) => c.t < c.life);
    }
    if (this.masteredFx) {
      this.masteredFx.t += dtReal;
      if (this.masteredFx.t > 2.4) this.masteredFx = null;
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

    // The clock. This line is only reached while the run is genuinely live:
    // update() is not called at all when paused or reading the instructions,
    // and everything above returns early on the title, profile, game-over and
    // victory screens. So the time on the board is time spent playing.
    this.runTime += dtReal;

    this.waveBanner = Math.max(0, this.waveBanner - dtReal);
    if (this.bossBanner) this.bossBanner = Math.max(0, this.bossBanner - dtReal);
    if (this.unlockBanner) this.unlockBanner = Math.max(0, this.unlockBanner - dtReal);

    if (this.wavePhase === 'interlude') {
      this.phaseTimer -= dtReal;
      if (this.phaseTimer <= 0) {
        this.camera.release();
        this._nextWave();
      }
    } else if (this.wavePhase === 'boss' && this.boss) {
      const k = this.boss;
      k.update(dt, this.bossApi);
      // Clearing the last demand does not kill it. The core opens, the turret
      // winds up, and one shot finishes it -- an ending rather than a
      // disappearance. Every boss ends this way; only the body differs.
      if (k.alive && k.spent && this.beasts.length === 0 && k.phase === 'fight') {
        k.expose();
        this.audio.charged();
        this.camera.shake(0.5);
      }
      // `k.alive` matters: readyToBlow stays true once the charge completes,
      // and update() freezes phaseT while dying, so without this the finisher
      // re-fired every frame -- resetting the death timer so the wave never
      // ended, and paying the kill bonus sixty times a second.
      // The shot is drawn out of the dome before it leaves the muzzle: a
      // surge runs the arc from both ends into the cannon.
      if (k.charge > 0 && !this._surging) {
        this._surging = true;
        this.audio.surge(k.chargeLen, SURGE_LAND);
      }
      this.shield.surgeTo(k.charge);
      if (k.alive && k.readyToBlow) this._killBoss(k);
      // Not until the whole finale has played. The death timer alone expired
      // mid-collapse, so WAVE CLEAR printed straight over the supernova and
      // the remnant was collected behind an overlay.
      const finale = this.bossBlast || this.orbs.list.some((o) => o.infinity);
      if (!k.alive && k.dieT > 1.4 && !finale) {
        this.shield.surgeTo(0);
        this._surging = false;
        this.boss = null;
        this.camera.noStop = false;
        this._endWave();
      }
    } else if (this.waveRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this._spawn();
        this.spawnTimer = clamp(2.8 - this.wave * 0.14, 0.9, 2.8) + rand(0.6);
      }
    } else if (this.beasts.length === 0 && this.warps.length === 0) {
      // A pending seam counts as an unspawned beast. Without that the wave
      // could end in the gap between the door opening and the thing coming
      // through it.
      this._endWave();
    }

    // Seams. Each opens, then hands over a beast and closes.
    for (let i = 0; i < this.warps.length; i++) {
      const w = this.warps[i];
      w.t += dt;
      if (w.t >= WARP) {
        this._emerge(w.x);
        this.warps.splice(i--, 1);
      }
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
        (b) => b.id === this.manualTargetId && b.ready && !b.locked,
      );
      if (held) target = held;
      else this.manualTargetId = null;
    }
    if (!target) {
      for (const b of this.beasts) {
        // `ready`, not `alive`: a beast still closing from far off is not
        // answerable. Targeting reads the whole list, so without this a quick
        // player solves a problem off the readout before the thing carrying it
        // has finished arriving -- which is how they never saw one appear.
        if (!b.ready || b.locked) continue;
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
    // The last-core state fades in rather than snapping, and fades back out if
    // a core is somehow recovered.
    const stand = this.state === 'playing' && this.cores === 1 ? 1 : 0;
    this.lastStandT = damp(this.lastStandT, stand, 2.6, dtReal);
    this.audio.setDanger(this.danger);

    // A boss owns the camera for the duration: pulled back to open the field,
    // and no bullet time. The fixed 1280x720 frame cannot hold a boss worth
    // looking at -- at full zoom a 380px shell fights the score readout for
    // room -- so the field opens instead of the boss shrinking. Each boss
    // names its own pull-back, because how big a boss looks is mostly a camera
    // decision. Slow motion stays off: the pressure in these fights is the
    // clock, and bullet time hands that back every time something gets close.
    if (this.boss) {
      this.camera.slowmo = damp(this.camera.slowmo, 0, 9, dtReal);
      this.camera.punchIn(this.boss.zoom, 0, isLeviathan(this.wave) ? 46 : 30);
    } else {
      const nearMiss = !theme.reducedMotion && maxProgress > 0.86 && this.targetBeast;
      this.camera.slowmo = damp(this.camera.slowmo, nearMiss ? 1 : 0, 7, dtReal);
      if (this.waveOpenT > 0) this.waveOpenT -= dtReal;
      if (nearMiss) {
        const b = this.targetBeast;
        this.camera.punchIn(1.14, (b.x - W / 2) * 0.35, (b.y - H / 2) * 0.35);
      } else if (this.waveOpenT > 0 && !theme.reducedMotion) {
        // A wide shot as a wave opens, easing back before anyone has to read
        // anything. A *permanent* pull-back would be the wrong trade -- the
        // beasts are text, and zooming out shrinks the one thing that has to
        // stay legible -- but the establishing beat costs nothing here, because
        // the first arrivals are still closing and unreadable anyway.
        this.camera.punchIn(0.9, 0, 26);
      } else if (this.wavePhase !== 'interlude') {
        this.camera.release();
      }
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

    if (this.boss) {
      this.boss.draw(ctx);
      if (this.boss.charge > 0) this._drawFinisher(ctx, this.boss);
    }
    if (this.bossBlast) this._drawBlast(ctx);
    for (const b of this.beasts) {
      if (!b.arriving) b.drawBeam(ctx, this.shield.domeY(b.x), this.time);
    }
    if (this.warps.length) this._drawWarps(ctx);
    this.shield.draw(ctx);
    if (this.state === 'playing') this.turret.draw(ctx, this.danger, this.overcharge);
    for (const b of this.beasts) {
      // Closing from far off: drawn small and hazy around its own centre, so
      // the arrival reads as depth rather than as something popping into
      // existence at full size.
      if (b.arriving) {
        const k = b.arriveScale;
        ctx.save();
        ctx.globalAlpha = 0.35 + b.arrival * 0.65;
        ctx.translate(b.x, b.y);
        ctx.scale(k, k);
        ctx.translate(-b.x, -b.y);
        b.draw(ctx, false);
        ctx.restore();
      } else {
        b.draw(ctx, b === this.targetBeast);
      }
    }
    for (const s of this.shots) s.draw(ctx);
    if (this.chainFx.length) this._drawChains(ctx);
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
      // On the last core the colour drains out of the world. The danger ramp
      // is continuous by design; this is the one hard edge in it.
      desat: q.desat ? clamp(this.camera.slowmo * 0.7 + this.lastStandT * 0.55, 0, 1) : 0,
      vignette: 0.5 + this.danger * 0.25 + this.lastStandT * 0.22,
    });

    if (this.state === 'playing') {
      if (q.desat) drawFocus(this.out, this, W, H, this.camera.slowmo, this.camera);
      if (this.wavePhase === 'interlude') {
        drawInterlude(this.out, this, W, H, 1 - this.phaseTimer / (this.interludeLen || INTERLUDE));
      }
    }
    // Instructions replace the title/game-over overlay rather than stacking on
    // top of it -- a 94%-opaque scrim still lets big glowing text read through.
    if (this.menu) {
      drawMenu(this.out, this, W, H, this.time);
    } else if (this.help) {
      drawHelp(this.out, W, H, this);
    } else if (this.board) {
      drawLeaderboard(this.out, this, W, H);
    } else if (this.sky) {
      drawStarChart(this.out, this, W, H, this.time);
    } else if (this.report) {
      drawProgress(this.out, this, W, H, dayKey());
    } else if (this.codex) {
      drawCodex(this.out, this, W, H, this.time);
    } else if (this.state === 'profile') {
      drawProfiles(this.out, this, W, H, this.time);
    } else {
      if (this.state === 'title') drawTitle(this.out, W, H, this.time, this);
      if (this.state === 'gameover') drawGameOver(this.out, this, W, H, this.stateTime);
      if (this.state === 'victory') drawVictory(this.out, this, W, H, this.stateTime);
    }

    // Overrides everything: there is nothing useful to show sideways.
    if (this.portrait) drawRotate(this.out, W, H, this.time);
    // The menu pauses the run but says so itself. Drawing PAUSED over it puts
    // a word across the middle of the list and adds a second scrim.
    if (this.paused && !this.menu) {
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

  // The door opening. A vertical seam of light that widens, brightens and then
  // snaps shut as the beast comes through -- the one thing a player who clears
  // the board faster than it refills still sees, so the field stops feeling
  // like things arrive behind their back.
  _drawWarps(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const w of this.warps) {
      const k = clamp(w.t / WARP, 0, 1);
      // Opens fast, holds, then pinches at the very end as it delivers.
      const open = k < 0.75 ? easeOutCubic(k / 0.75) : 1 - (k - 0.75) / 0.25;
      const halfH = 10 + open * 58;
      const halfW = 1.5 + open * 9;

      const g = ctx.createLinearGradient(w.x - halfW * 5, 0, w.x + halfW * 5, 0);
      g.addColorStop(0, `hsla(${theme.hostile}, 100%, 60%, 0)`);
      g.addColorStop(0.5, `hsla(${theme.hostile + 14}, 100%, 74%, ${0.5 * open})`);
      g.addColorStop(1, `hsla(${theme.hostile}, 100%, 60%, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(w.x - halfW * 5, ARRIVE_Y - halfH, halfW * 10, halfH * 2);

      // The seam itself: a hot white line down the middle.
      ctx.fillStyle = `rgba(255,240,250,${0.35 + open * 0.6})`;
      ctx.fillRect(w.x - halfW * 0.5, ARRIVE_Y - halfH, halfW, halfH * 2);

      // Caps, so it reads as an opening rather than a stripe.
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(w.x, ARRIVE_Y + dir * halfH, halfW * 1.6, 0, TAU);
        ctx.fillStyle = `hsla(${theme.hostile + 20}, 100%, 80%, ${0.5 * open})`;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // A jagged bolt between two answers that share a factor.
  _drawChains(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const c of this.chainFx) {
      const k = 1 - c.t / c.life;
      const dx = c.bx - c.ax;
      const dy = c.by - c.ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const steps = Math.max(3, Math.round(len / 26));
      ctx.beginPath();
      ctx.moveTo(c.ax, c.ay);
      for (let i = 1; i < steps; i++) {
        const f = i / steps;
        // Deterministic zigzag: a random one reshapes itself every frame and
        // reads as static rather than a bolt.
        const wob = Math.sin(f * 9.1 + c.ax * 0.05) * 13 * Math.sin(f * Math.PI) * k;
        ctx.lineTo(c.ax + dx * f + nx * wob, c.ay + dy * f + ny * wob);
      }
      ctx.lineTo(c.bx, c.by);
      ctx.strokeStyle = `hsla(${theme.orb}, 100%, 74%, ${0.85 * k})`;
      ctx.lineWidth = 1.5 + 5 * k;
      ctx.stroke();
      ctx.strokeStyle = `hsla(${theme.orb}, 100%, 92%, ${0.9 * k})`;
      ctx.lineWidth = 1.6 * k;
      ctx.stroke();
    }
    ctx.restore();
  }

  // The finishing shot: the turret winds up and lets go in one line.
  _drawFinisher(ctx, k) {
    const c = k.charge;
    const x0 = this.turret.x;
    const y0 = this.turret.y - 18;
    // Nothing leaves the muzzle until the surge has run the arc and arrived.
    const fire = clamp((c - SURGE_LAND) / (1 - SURGE_LAND), 0, 1);
    const gather = clamp(c / SURGE_LAND, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // The charge gathering at the muzzle before any of it leaves -- fed by the
    // dome, so it only really blooms once the surge lands.
    const gr = 5 + gather * 12 + fire * 44;
    const g = ctx.createRadialGradient(x0, y0, 0, x0, y0, gr);
    g.addColorStop(0, `rgba(255,255,255,${0.3 + fire * 0.7})`);
    g.addColorStop(1, 'hsla(190,100%,60%,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x0, y0, gr, 0, TAU);
    ctx.fill();

    // A thin sighting line that thickens into the shot.
    const w = 0.8 + Math.pow(fire, 3) * 40;
    ctx.strokeStyle = `hsla(190, 100%, ${72 + fire * 28}%, ${0.18 + gather * 0.1 + fire * 0.72})`;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(k.x, k.y);
    ctx.stroke();
    if (fire > 0.6) {
      ctx.strokeStyle = `rgba(255,255,255,${(fire - 0.6) / 0.4})`;
      ctx.lineWidth = w * 0.3;
      ctx.stroke();
    }
    ctx.restore();
  }

  // The burn, then the well. Outward it is a white sky going blue at the
  // edges; inward the surroundings darken and a point gets brighter as
  // everything falls into it.
  _drawBlast(ctx) {
    const b = this.bossBlast;
    // The burn takes the colour of what it is about to leave behind, so the
    // Hydra's collapse is green and the Prism's is magenta.
    const h = b.remnant ? b.remnant.hue : 190;
    ctx.save();
    if (b.phase === 'out') {
      const k = 1 - clamp(b.t / NOVA_OUT, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      const rr = 1150 * (1 - k * 0.5);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rr);
      g.addColorStop(0, `rgba(255,255,255,${k})`);
      g.addColorStop(0.16, `hsla(${h},100%,82%,${k * 0.9})`);
      g.addColorStop(0.42, `hsla(${h + 22},100%,64%,${k * 0.45})`);
      g.addColorStop(1, `hsla(${h + 42},100%,50%,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(b.x - rr, b.y - rr, rr * 2, rr * 2);
    } else if (b.phase === 'in') {
      const k = clamp(b.t / NOVA_IN, 0, 1);
      ctx.globalCompositeOperation = 'source-over';
      const d = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 700);
      d.addColorStop(0, 'rgba(0,0,0,0)');
      d.addColorStop(1, `rgba(2,2,10,${k * 0.8})`);
      ctx.fillStyle = d;
      ctx.fillRect(b.x - 700, b.y - 700, 1400, 1400);

      ctx.globalCompositeOperation = 'lighter';
      const r = 230 * (1 - k) + 12;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.35 + k * 0.65})`);
      g.addColorStop(1, `hsla(${h + 6},100%,60%,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
    }
    ctx.restore();
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
// Exposed for the test suite, which drives the menu by tapping its rows.
window.__menu = { menuItems };
