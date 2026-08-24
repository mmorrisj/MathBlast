// What every boss has in common.
//
// The Kraken proved the shape: an encounter is not a big beast, it is a
// director. It holds no problems of its own -- it pushes ordinary beasts into
// game.beasts and lets the existing machinery do the work, so targeting,
// scoring, the skill table and the progress ledger all keep working without
// knowing which boss is on screen.
//
// This base owns the parts that should never differ between bosses: the phase
// machine (fight -> exposed -> firing -> dying), the wind-up the dome surge is
// paced against, and the fact that the killing shot has to be earned rather
// than falling out of the last correct answer. A subclass writes two things --
// how its fight works, and what it looks like -- and inherits an ending.

import { TAU, clamp, rand } from '../../util.js';
import { theme } from '../../theme.js';
import { Beast } from '../beasts/base.js';

export const EXPOSED = 0.9;     // the core laid bare, before the shot
export const CHARGE = 1.15;     // the turret winding up; the surge is paced to it
const FIRST_SALVO = 2.2;        // a beat to read the board before the first one
const OPEN = 7.5;               // how long the core stays answerable
const MISSILE = 118;            // px/s -- fast enough to matter, slow enough to solve

export class Encounter {
  constructor(x, y, wave) {
    this.x = x; this.y = y;
    this.wave = wave;
    this.t = 0;
    this.state = 'alive';
    this.dieT = 0;
    this.hue = theme.boss;
    this.hitFlash = 0;
    this.phase = 'fight';
    this.phaseT = 0;
    this.drift = rand(TAU);
    // Beasts this encounter is holding. Subclasses put their demands here and
    // the base drops the ones the player has already answered.
    this.held = [];

    // The volley cycle.
    //
    // Seven of the ten shipped with no way to hurt you at all: left completely
    // alone for a minute, the Hydra, Remainder, Cipher, Prism, Nought, Twins
    // and Echo cost nothing, moved nothing toward the planet, and would have
    // waited for ever. They were puzzle screens with a boss drawn behind them.
    //
    // So a boss now fires: a salvo of problems that fall at the planet and do
    // real damage if they land. While any of it is in the air the core is
    // sealed and its own problem cannot be answered -- deal with the incoming
    // first. Clear the salvo and the core opens for a window, and *that* is
    // when the boss itself is solvable. Fight, breathe, fight.
    this.beat = 'open';         // 'salvo' | 'open'
    this.beatT = FIRST_SALVO;   // a moment to read the board before the first
    this.missiles = [];
  }

  // --- what the game asks of every encounter -----------------------------

  static get title() { return 'GUARDIAN'; }
  static get tagline() { return 'SOLVE IT DOWN'; }
  // How far the camera pulls back. Leviathans open the field further than
  // Wardens: the size of a boss is mostly a camera decision.
  static get zoom() { return 0.8; }
  // Where it hangs. Everything a boss holds has to sit between the top edge
  // and the dome: a demand spawned below the dome line arrives the instant it
  // exists, costs a core, and is gone before it can ever be answered.
  static get originY() { return 250; }
  // What it leaves behind once the supernova collapses. The Kraken's infinity
  // orb was the first; each boss gets its own so the trophies differ.
  static get remnant() { return { glyph: '∞', hue: 188 }; }

  get title() { return this.constructor.title; }
  get tagline() { return this.constructor.tagline; }
  get zoom() { return this.constructor.zoom; }
  get remnant() { return this.constructor.remnant; }

  get alive() { return this.state === 'alive'; }
  get exposed() { return this.phase === 'exposed' || this.phase === 'firing'; }
  get chargeLen() { return CHARGE; }

  // 0..1 while the turret winds up, for the surge the game runs up the dome.
  // The liveness check matters: the phase stays 'firing' while the boss dies,
  // so without it the beam hangs there through the whole finale.
  get charge() {
    return this.alive && this.phase === 'firing' ? clamp(this.phaseT / CHARGE, 0, 1) : 0;
  }

  get readyToBlow() { return this.phase === 'firing' && this.phaseT >= CHARGE; }

  // Subclasses say when their fight is over. Keyed on work *created*, never on
  // work currently on screen -- the Kraken shipped keyed on launches, so
  // destroying a demand early just made room for a replacement and being quick
  // was punished by a fight that never advanced.
  get spent() { return false; }
  // How much is left, drawn as pips. -1 hides them.
  get left() { return -1; }
  get total() { return 0; }

  // --- the phase machine --------------------------------------------------

  update(dt, api) {
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.4);
    if (this.state === 'dying') { this.dieT += dt; return; }

    if (this.phase !== 'fight') {
      this.phaseT += dt;
      // It thrashes while it is open, and drifts up as if trying to leave.
      this.x += Math.sin(this.t * 5) * 40 * dt;
      this.y -= dt * 10;
      if (this.phase === 'exposed' && this.phaseT >= EXPOSED) {
        this.phase = 'firing';
        this.phaseT = 0;
      }
      return;
    }

    // Accounting, and the one place it is easy to get wrong. A demand can
    // leave in three ways: solved (it goes to 'dying'), released at the planet
    // (attached cleared), or landed (straight to 'dead'). Only the first is
    // progress -- counting a landing as a solve would let a player win a boss
    // by ignoring it.
    const kept = [];
    const solved = [];
    for (const b of this.held) {
      if (b.attached && b.alive) { kept.push(b); continue; }
      if (b.attached && b.state === 'dying') solved.push(b);
    }
    this.held = kept;
    // Notify only once the list has settled. Calling the hook inside the loop
    // hands the subclass the pre-filter array, so the Twins -- which decide
    // what happened by how many siblings are left standing -- always saw two,
    // never cleared a pair, and regenerated for ever.
    for (const b of solved) this._solved(b);
    this._volley(dt, api);
    this._fight(dt, api);
  }

  // Subclass hook. `api` carries everything an encounter is allowed to reach:
  //   demand(spec) -> push a problem into the world and hold it
  //   release(b)   -> let one go at the planet
  //   hurt(x)      -> the boss got a hit in
  //   audio, wave, skill
  _fight() {}

  // One of this encounter's own demands was answered correctly.
  _solved() {}

  // How many problems this boss throws per salvo. Zero for the ones that
  // already bring their own pressure -- the Bulwark's wall is always closing,
  // the Kraken's arms launch themselves, the Balance tips onto the dome -- and
  // stacking a second threat on top of a working one just makes them noisy.
  static get salvo() { return 0; }
  get salvoSize() { return this.constructor.salvo; }

  // Is the core answerable right now?
  get openCore() { return this.beat === 'open'; }
  // For the readout: 0..1 through the current window.
  get beatLeft() { return this.beat === 'open' ? Math.max(0, this.beatT) : 0; }

  _volley(dt, api) {
    if (!this.salvoSize) return;
    this.missiles = this.missiles.filter((m) => m.alive);

    if (this.beat === 'salvo') {
      // The core stays shut until the sky is clear. Landing one is not a
      // stalemate either -- it did its damage on the way through.
      if (this.missiles.length === 0) {
        this.beat = 'open';
        this.beatT = OPEN;
      }
    } else {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beat = 'salvo';
        this._fire(api);
      }
    }
    // Whatever the beat, the held demands agree with it.
    for (const b of this.held) b.sealed = !this.openCore;
  }

  // Throw a salvo. The problems come from the curriculum, so a boss needs to
  // know nothing about tiers or the adaptive plan to shoot at you.
  _fire(api) {
    const n = this.salvoSize;
    for (let i = 0; i < n; i++) {
      const x = this.x + (i - (n - 1) / 2) * 190 + rand(40, -40);
      const m = api.curriculum(clamp(x, 140, 1140), this.y + 40);
      if (!m) break;
      api.release(m, MISSILE);
      m.missile = true;
      this.missiles.push(m);
    }
    if (api.audio && api.audio.boss) api.audio.boss();
  }

  // The last demand fell: stop the fight and lay the core open. Nothing else
  // kills a boss -- the core has to be shot, which is what makes the ending an
  // ending rather than a disappearance.
  expose() {
    if (this.phase === 'fight') { this.phase = 'exposed'; this.phaseT = 0; }
  }

  kill() { this.state = 'dying'; this.dieT = 0; }

  // How far open the shell is, 0..1. Subclass art uses it to crack itself.
  get open() {
    if (!this.exposed) return 0;
    return clamp(this.phaseT / (this.phase === 'firing' ? CHARGE : EXPOSED), 0, 1);
  }

  // Called with the raw value on a wrong answer against one of this
  // encounter's demands. The Cipher uses it to light its tumblers; most bosses
  // do not care.
  onWrong() {}

  // --- shared art ---------------------------------------------------------

  draw(ctx) {
    const dying = this.state === 'dying';
    const p = dying ? clamp(this.dieT / 1.4, 0, 1) : 0;
    ctx.save();
    if (dying) {
      ctx.globalAlpha = 1 - p * p;
      const s = 1 + p * 0.6;
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
    }
    this._drawBody(ctx);
    if (this.exposed) this._drawOpen(ctx);
    ctx.restore();
  }

  _drawBody() {}

  // The white heat showing through once the shell splits. Every boss dies the
  // same way, so every boss opens the same way.
  _drawOpen(ctx, radius = 140) {
    const open = this.open;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = radius * (0.7 + open * 0.9);
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.5 + open * 0.5})`);
    g.addColorStop(0.4, `hsla(${44 - open * 30}, 100%, 70%, ${0.5 + open * 0.4})`);
    g.addColorStop(1, 'hsla(12,100%,60%,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

}

// A problem a boss made up itself.
//
// Most demands cannot come from the curriculum: the Twins need two expressions
// with the same answer, the Hydra needs a number that halves, the Cipher needs
// a secret with no prompt at all. This is the smallest Beast that lets a boss
// state its own question and its own answer while still being an ordinary
// beast to everything else in the game.
export class DemandBeast extends Beast {
  // spec: { prompt, hint, answer, concept, mag, a, b, op, accept }
  constructor(spec, x, y, speed = 0) {
    super(x, y, speed);
    this.spec = spec;
    this.hue = spec.hue != null ? spec.hue : theme.boss;
    this.w = spec.w || 96;
    this.h = spec.h || 96;
    this.a = spec.a;
    this.b = spec.b;
    // Facts with no (a, b) pair must not reach the skill table -- it keys on
    // the pair, and `undefined×undefined` is one row every boss shares.
    if (this.a == null || this.b == null) { this.a = null; this.b = null; }
  }

  get isBoss() { return true; }
  get magnitude() { return this.spec.mag != null ? this.spec.mag : 30; }
  get concept() { return this.spec.concept || 'other'; }
  get factOp() { return this.spec.op || '×'; }
  get promptText() { return this.spec.prompt; }
  get hintText() { return this.spec.hint != null ? this.spec.hint : `${this.spec.prompt} =`; }
  get answerText() { return String(this.spec.answer); }

  accepts(raw) {
    const norm = (s) => String(s).trim().replace(/^−/, '-');
    if (this.spec.accept) return this.spec.accept(norm(raw));
    return norm(raw) === norm(this.answerText);
  }

  draw(ctx, isTarget) {
    const r = Math.max(this.w, this.h) / 2;
    this.drawShell(ctx, isTarget, r);
    const dying = this.state === 'dying';
    const k = dying ? clamp(this.dieT / this.dieFor, 0, 1) : 0;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.translate(this.x, this.y);
    ctx.scale(1 + k * 0.5, 1 + k * 0.5);
    ctx.fillStyle = `hsla(${this.hue}, 70%, ${12 + this.hitFlash * 30}%, 0.92)`;
    ctx.strokeStyle = `hsla(${this.hue}, 100%, ${62 + this.hitFlash * 30}%, 0.95)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.8, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (!dying) this.drawLabel(ctx, this.promptText, this.spec.size || 28);
  }
}
