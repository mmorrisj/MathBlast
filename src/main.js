// MathBlast -- vertical slice.
//
// Fixed 1280x720 virtual resolution rendered into an offscreen scene buffer,
// pushed through the post chain, then blitted to a display canvas that CSS
// scales to the viewport. Constant render cost regardless of window size.

import { clamp, damp, inverseLerp, rand } from './util.js';
import { Audio } from './audio.js';
import { SkillTable, makeProblem } from './problems.js';
import { Camera } from './fx/camera.js';
import { Particles } from './fx/particles.js';
import { Post } from './render/post.js';
import { Starfield } from './render/starfield.js';
import { Beast } from './entities/beast.js';
import { Shield, CX } from './entities/shield.js';
import { Projectile, Turret } from './entities/projectile.js';
import { drawHud, drawTitle, drawGameOver, drawFocus } from './ui/hud.js';
import { Quality } from './quality.js';

const W = 1280;
const H = 720;

class Game {
  constructor(canvas) {
    this.display = canvas;
    this.display.width = W;
    this.display.height = H;
    // The scene is drawn straight into the visible canvas; post effects then run
    // in place on it. No full-resolution intermediate buffer.
    this.ctx = canvas.getContext('2d');
    this.out = this.ctx;

    this.post = new Post(W, H);
    this.stars = new Starfield(W, H);
    this.particles = new Particles();
    this.camera = new Camera();
    this.audio = new Audio();
    this.skill = new SkillTable();
    // ?q=low|medium|high pins the tier; otherwise it adapts to measured framerate.
    this.quality = new Quality(new URLSearchParams(location.search).get('q'));

    this.state = 'title';
    this.time = 0;
    this.stateTime = 0;
    this.paused = false;
    this.danger = 0;

    this.reset();
    this._bindInput();
    this._fit();
    window.addEventListener('resize', () => this._fit());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.paused = true;
    });
  }

  reset() {
    this.shield = new Shield();
    this.turret = new Turret(CX, this.shield.domeY(CX) - 26);
    this.beasts = [];
    this.shots = [];
    this.particles.clear();

    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.cores = 3;
    this.wave = 0;
    this.solved = 0;
    this.attempts = 0;
    this.input = '';
    this.inputPulse = 0;
    this.waveBanner = 0;
    this.spawnTimer = 0;
    this.waveRemaining = 0;
    this.targetBeast = null;

    // Start with a partial dome so the first landing isn't instantly fatal.
    for (let i = 0; i < 8; i++) this.shield.addPlate(CX + rand(260, -260));
    for (const p of this.shield.plates) p.pop = 0;
  }

  // --- input -------------------------------------------------------------

  _bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();

      if (this.state === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          this.audio.start();
          this.state = 'playing';
          this.stateTime = 0;
          this._nextWave();
        }
        return;
      }

      if (this.state === 'gameover') {
        if (e.key === 'Enter') {
          this.reset();
          this.state = 'playing';
          this.stateTime = 0;
          this._nextWave();
        }
        return;
      }

      if (e.key === 'm' || e.key === 'M') { this.audio.toggleMute(); return; }
      if (e.key === 'q' || e.key === 'Q') { this.quality.cycle(); return; }
      if (e.key === 'p' || e.key === 'P') { this.paused = !this.paused; return; }
      if (this.paused) { this.paused = false; return; }

      if (e.key >= '0' && e.key <= '9') {
        if (this.input.length < 3) {
          this.input += e.key;
          this.inputPulse = 1;
        }
      } else if (e.key === 'Backspace') {
        this.input = this.input.slice(0, -1);
        this.inputPulse = 1;
      } else if (e.key === 'Escape') {
        this.input = '';
        this.inputPulse = 1;
      } else if (e.key === 'Enter') {
        this._fire();
      }
    });

    // Any click resumes audio if the browser suspended the context.
    window.addEventListener('pointerdown', () => this.audio.resume());
  }

  _fire() {
    const t = this.targetBeast;
    if (!t || !this.input) return;
    const value = parseInt(this.input, 10);
    const correct = value === t.answer;

    const elapsed = performance.now() / 1000 - t.bornAt;
    this.skill.record(t.a, t.b, elapsed, correct);
    this.attempts++;
    if (correct) this.solved++;

    // Lock the beast so targeting advances immediately -- the player can start
    // the next problem while the bolt is still in flight.
    t.locked = true;
    t.pendingCorrect = correct;
    t.solveTime = elapsed;

    const m = this.turret.muzzle;
    this.shots.push(new Projectile(m.x, m.y, t, value, correct));
    this.turret.fire();
    this.audio.fire();
    this.input = '';
    this.inputPulse = 1;
  }

  // --- waves -------------------------------------------------------------

  _nextWave() {
    this.wave++;
    this.waveBanner = 2.2;
    this.waveRemaining = 3 + Math.floor(this.wave * 1.4);
    this.spawnTimer = 0.6;
  }

  _spawn() {
    const { a, b } = makeProblem(this.skill, this.wave);
    // Keep the whole lattice on screen.
    const halfW = (a * 15) / 2;
    const x = clamp(rand(W - 160, 160), halfW + 30, W - halfW - 30);
    // ~16s of descent on wave 1, tightening to ~10s by wave 6. Slow enough to
    // think through 7x8, fast enough that the screen is never idle.
    const speed = 34 + this.wave * 4 + rand(10);
    this.beasts.push(new Beast(a, b, x, -80 - rand(120), speed));
    this.waveRemaining--;
  }

  // --- resolution --------------------------------------------------------

  _resolveHit(shot) {
    const b = shot.target;
    if (b.gone || !b.alive) return;

    if (shot.correct) {
      b.kill();
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);

      // Fluency bonus: answering faster than 3s scales the reward.
      const speedBonus = clamp(1.8 - b.solveTime / 3, 0, 1.2);
      const mult = Math.min(this.combo, 10);
      this.score += Math.round((40 + b.a * b.b) * (1 + speedBonus) * mult / 4);

      this.audio.correct(this.combo);
      this.camera.stop(0.075);                 // hitstop -- the core of "satisfying"
      this.camera.shake(0.28 + Math.min(this.combo, 10) * 0.012);

      const digits = String(b.answer).split('');
      this.particles.burst(b.x, b.y, 46, {
        hue: 44, speed: 420, life: 0.9, size: 5, glyphs: digits, grav: 120,
      });
      this.particles.burst(b.x, b.y, 22, { hue: 168, speed: 620, life: 0.5, size: 3.4 });

      const plate = this.shield.addPlate(b.x);
      if (plate) {
        this.shield.sparkle(this.particles, plate);
        this.audio.plate();
      }
    } else {
      b.locked = false;
      b.repel();
      this.combo = 0;
      this.audio.wrong();
      this.camera.shake(0.22);
      this.particles.burst(b.x, b.y, 14, { hue: 8, speed: 200, life: 0.5, size: 3.5 });
      const plate = this.shield.crackPlate(b.x);
      if (plate) this.particles.burst(plate.x, plate.y, 12, { hue: 8, speed: 220, life: 0.5 });
    }
  }

  _land(b) {
    const absorbed = this.shield.absorb(b.x);
    this.combo = 0;
    const y = this.shield.domeY(b.x);

    if (absorbed) {
      // The dome held. Those plates were earned by earlier correct answers.
      this.camera.shake(0.55);
      this.camera.stop(0.06);
      this.particles.burst(b.x, y, 60, { hue: 188, speed: 520, life: 0.9, size: 5 });
      this.audio.land();
    } else {
      this.cores--;
      this.shield.scar(b.x);
      this.camera.shake(1);
      this.camera.stop(0.1);
      this.particles.burst(b.x, y + 20, 90, { hue: 20, speed: 620, life: 1.4, size: 6, grav: 260 });
      this.audio.land();
      if (this.cores <= 0) {
        this.state = 'gameover';
        this.stateTime = 0;
        this.audio.gameOver();
      }
    }
    b.state = 'dead';
  }

  // --- update ------------------------------------------------------------

  update(dtReal) {
    this.time += dtReal;
    this.stateTime += dtReal;
    this.inputPulse = Math.max(0, this.inputPulse - dtReal * 3.4);

    const dt = this.camera.update(dtReal);
    this.stars.update(dt);

    if (this.state !== 'playing') {
      this.particles.update(dt);
      this.shield.update(dt);
      return;
    }

    this.waveBanner = Math.max(0, this.waveBanner - dtReal);

    // Spawning.
    if (this.waveRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this._spawn();
        this.spawnTimer = clamp(2.8 - this.wave * 0.14, 0.9, 2.8) + rand(0.6);
      }
    } else if (this.beasts.length === 0) {
      this._nextWave();
    }

    // Beasts.
    let maxProgress = 0;
    for (const b of this.beasts) {
      const prevDie = b.dieT;
      b.update(dt);
      b.emitCollapse(this.particles, prevDie);
      if (b.alive) {
        const ground = this.shield.domeY(b.x);
        maxProgress = Math.max(maxProgress, inverseLerp(-80, ground, b.bottom));
        if (b.bottom >= ground) this._land(b);
      }
    }
    this.beasts = this.beasts.filter((b) => !b.gone);

    // Target the most dangerous unlocked beast.
    let target = null;
    for (const b of this.beasts) {
      if (!b.alive || b.locked) continue;
      if (!target || b.bottom > target.bottom) target = b;
    }
    if (target !== this.targetBeast) this.input = '';
    this.targetBeast = target;

    // Shots.
    for (const s of this.shots) {
      if (s.update(dt)) this._resolveHit(s);
    }
    this.shots = this.shots.filter((s) => !s.dead);

    this.turret.update(dt, this.targetBeast);
    this.shield.update(dt);
    this.particles.update(dt);

    // Danger drives the music mix, the aberration, and the near-miss slow motion.
    this.danger = damp(this.danger, maxProgress, 5, dtReal);
    this.audio.setDanger(this.danger);

    const nearMiss = maxProgress > 0.86 && this.targetBeast;
    this.camera.slowmo = damp(this.camera.slowmo, nearMiss ? 1 : 0, 7, dtReal);
    if (nearMiss) {
      const b = this.targetBeast;
      this.camera.punchIn(1.14, (b.x - W / 2) * 0.35, (b.y - H / 2) * 0.35);
    } else {
      this.camera.release();
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

    // The backdrop is drawn outside the camera transform. It is exactly screen
    // sized, so letting zoom/shake move it would expose bare canvas at the edges.
    this.stars.draw(ctx, this.danger, q.stars);

    ctx.save();
    this.camera.apply(ctx, W, H);

    for (const b of this.beasts) b.drawBeam(ctx, this.shield.domeY(b.x), this.time);
    this.shield.draw(ctx);
    if (this.state === 'playing') this.turret.draw(ctx, this.danger);
    for (const b of this.beasts) b.draw(ctx, b === this.targetBeast);
    for (const s of this.shots) s.draw(ctx);
    this.particles.draw(ctx);

    ctx.restore();

    if (this.state === 'playing') drawHud(ctx, this, W, H);

    // Post. Aberration and bloom both ride the danger curve.
    this.post.apply(this.out, {
      bloom: q.bloom ? 0.85 + this.danger * 0.3 : 0,
      aberration: q.aberration ? Math.max(0, this.danger - 0.5) * 0.9 + this.camera.slowmo * 0.25 : 0,
      desat: q.desat ? this.camera.slowmo * 0.7 : 0,
      vignette: 0.5 + this.danger * 0.25,
    });

    // Overlays sit above post so they stay crisp and full-colour.
    if (this.state === 'playing' && q.desat) {
      drawFocus(this.out, this, W, H, this.camera.slowmo, this.camera);
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

  // Letterbox the fixed-resolution canvas into the viewport.
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

// Handy for tuning from the console.
window.game = game;
