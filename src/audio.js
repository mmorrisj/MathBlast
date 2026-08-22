// Synthesized audio. Every sound is generated from oscillators and noise
// buffers, so the game ships with zero audio assets.
//
// Four ideas drive this file:
//
//   1. Gameplay sounds are quantized to the beat grid, so play sounds musical
//      rather than like noise over the top of a track.
//   2. Correct answers walk up the *chord currently playing*, one tone per combo
//      step. The streak melody is harmonised with the backing, not layered onto
//      it, which is most of the difference between "composed" and "bolted on".
//   3. The mode shifts with the player's rolling accuracy -- Phrygian when
//      they're struggling, Ionian when they're flying. The soundtrack narrates
//      competence, not just threat.
//   4. Tempo and chord progression advance with the wave, so minute eight does
//      not sound like minute one.

import { clamp, lerp } from './util.js';

const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const ROOT = 110;                 // A2

// Modes as semitone offsets, ordered darkest to brightest. Rolling accuracy
// indexes into this list.
const MODES = [
  [0, 1, 3, 5, 7, 8, 10],        // Phrygian
  [0, 2, 3, 5, 7, 8, 10],        // Aeolian
  [0, 2, 3, 5, 7, 9, 10],        // Dorian
  [0, 2, 4, 5, 7, 9, 10],        // Mixolydian
  [0, 2, 4, 5, 7, 9, 11],        // Ionian
];

// Chord progressions as scale-degree indices. One is chosen per wave.
const PROGRESSIONS = [
  [0, 5, 3, 4],
  [0, 3, 4, 3],
  [0, 6, 5, 4],
  [0, 4, 5, 2],
];

// One bar of sixteenths per sector. null is a rest; a number is a scale degree
// above the current chord root, so the hook follows both the progression and
// the mode the player's accuracy has selected.
const HOOKS = [
  null,
  [0, null, null, 2, null, null, 4, null, 2, null, null, 4, null, 2, null, null],
  [4, null, 2, 4, null, 7, null, 4, 2, null, 4, null, 0, null, 2, null],
  [7, null, 5, 4, 7, null, 9, 7, 5, null, 4, 2, 0, 2, 4, null],
];

const semiToRatio = (s) => Math.pow(2, s / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;

    this.danger = 0;
    this.wave = 1;
    this.modeBlend = 1.5;         // continuous; rounded to pick a mode
    this.bpm = 100;
    this.progression = PROGRESSIONS[0];
    this.band = 0;                // arrangement stage, 0..3
    this.silentUntil = 0;         // wall-clock time to hold the arrangement
    this.layerGain = {};
    this.chordDegree = 0;
  }

  get spb() { return 60 / this.bpm; }
  get stepDur() { return this.spb / 4; }
  get mode() { return MODES[clamp(Math.round(this.modeBlend), 0, MODES.length - 1)]; }

  // Must be called from a user gesture (browser autoplay policy).
  start() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.15;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();

    // Reverb from a synthesized impulse response -- exponentially decaying
    // stereo noise. Gives the whole mix a room without shipping a WAV.
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.1, 2.6);
    this.verbReturn = ctx.createGain();
    this.verbReturn.gain.value = 0.9;
    this.verb.connect(this.verbReturn);
    this.verbReturn.connect(this.comp);

    this.musicBus.connect(this.comp);

    this.sfxBus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // Sidechain pump: the kick ducks everything melodic and it swells back.
    // This is most of what makes a driving track feel driving.
    this.pump = ctx.createGain();
    this.pump.gain.value = 1;
    this.pump.connect(this.comp);

    for (const name of ['pad', 'bass', 'arp', 'drums', 'lead']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      // Drums stay out of the pump, or they duck themselves.
      g.connect(name === 'drums' ? this.musicBus : this.pump);
      this.layerGain[name] = g;
    }
    this.pumpAmount = 0;
    // The pad is the layer that most benefits from space.
    this.padSend = ctx.createGain();
    this.padSend.gain.value = 0.5;
    this.layerGain.pad.connect(this.padSend);
    this.padSend.connect(this.verb);

    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.nextStepTime = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this._schedule(), TICK_MS);
    this.ready = true;
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const n = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, n, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        // Slight early build so it reads as a hall rather than a gate.
        const t = i / n;
        const env = Math.pow(1 - t, decay) * Math.min(1, t * 40);
        d[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return buf;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // ---- routing helpers --------------------------------------------------

  // Pan by screen x so you hear which side of the planet is under pressure.
  _panned(x, sendAmount = 0) {
    const g = this.ctx.createGain();
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp((x / 1280) * 2 - 1, -1, 1) * 0.75;
      g.connect(p);
      p.connect(this.sfxBus);
      if (sendAmount > 0) {
        const s = this.ctx.createGain();
        s.gain.value = sendAmount;
        p.connect(s);
        s.connect(this.verb);
      }
    } else {
      g.connect(this.sfxBus);
      if (sendAmount > 0) {
        const s = this.ctx.createGain();
        s.gain.value = sendAmount;
        g.connect(s);
        s.connect(this.verb);
      }
    }
    return g;
  }

  // ---- musical state ----------------------------------------------------

  setWave(wave) {
    this.wave = wave;
    // +2.4bpm a wave was inaudible while playing. Four is felt, and the
    // arrangement changes in bands so the track is recognisably different by
    // the time the sky is.
    this.bpm = 100 + Math.min(wave - 1, 9) * 4;
    this.band = Math.min(Math.floor((wave - 1) / 3), 3);
    this.pumpAmount = this.band === 0 ? 0 : 0.18 + this.band * 0.12;
    this.progression = PROGRESSIONS[(wave - 1) % PROGRESSIONS.length];
  }

  // `accuracy` is a rolling 0..1. Drives how bright the mode is.
  setAccuracy(accuracy) {
    const target = clamp(accuracy, 0, 1) * (MODES.length - 1);
    // Ease so the mode drifts rather than flipping on a single answer.
    this.modeBlend = lerp(this.modeBlend, target, 0.08);
  }

  setDanger(d) {
    this.danger = clamp(d, 0, 1);
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const hold = t < this.silentUntil ? 0 : 1;
    const targets = {
      pad: 0.5 * hold,
      bass: clamp((this.danger - 0.12) / 0.3, 0, 1) * 0.55 * hold,
      arp: clamp((this.danger - 0.42) / 0.3, 0, 1) * 0.34 * hold,
      drums: clamp((this.danger - 0.62) / 0.28, 0, 1) * 0.5 * hold,
      lead: this.band >= 1
        ? clamp((this.danger - 0.3) / 0.35, 0, 1) * (0.16 + this.band * 0.05) * hold
        : 0,
    };
    for (const k in targets) {
      this.layerGain[k].gain.setTargetAtTime(targets[k], t, hold ? 0.35 : 0.12);
    }
  }

  // The held breath between waves. Everything cuts; the reverb tail carries.
  holdBeat(seconds = 1.15) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.silentUntil = t + seconds;
    for (const k in this.layerGain) this.layerGain[k].gain.setTargetAtTime(0, t, 0.09);
  }

  // ---- scheduling -------------------------------------------------------

  _nextEighth() {
    if (!this.ready) return 0;
    const grid = this.stepDur * 2;
    return Math.ceil((this.ctx.currentTime + 0.005) / grid) * grid;
  }

  _schedule() {
    if (!this.ready) return;
    const ctx = this.ctx;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD) {
      if (this.nextStepTime >= this.silentUntil) this._playStep(this.step, this.nextStepTime);
      this.step++;
      this.nextStepTime += this.stepDur;
    }
  }

  // Semitone offset of a scale degree, wrapping octaves.
  _degree(d) {
    const m = this.mode;
    const oct = Math.floor(d / m.length);
    return m[((d % m.length) + m.length) % m.length] + 12 * oct;
  }

  // Root, third and fifth stacked in the current mode.
  _chordTones(degree) {
    const base = this._degree(degree);
    return [0, this._degree(degree + 2) - base, this._degree(degree + 4) - base];
  }

  _chordRoot(degree) { return ROOT * semiToRatio(this._degree(degree)); }

  _playStep(step, time) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    this.chordDegree = this.progression[bar % this.progression.length];
    const root = this._chordRoot(this.chordDegree);

    if (s === 0) this._pad(this.chordDegree, time);
    if (s % 4 === 0 || s === 6 || s === 14) this._bass(root, time, s);
    // Offbeat stabs from the second sector: the bassline stops walking and
    // starts pushing.
    if (this.band >= 1 && (s === 3 || s === 11)) this._bass(root, time, -1);
    if (s % 2 === 0) this._arp(this.chordDegree, time, step);
    this._hook(this.chordDegree, time, s);
    this._drums(s, time);
  }

  _pad(degree, time) {
    const g = this.layerGain.pad;
    const root = this._chordRoot(degree);
    const dur = this.spb * 4;
    for (const semi of [...this._chordTones(degree), 12]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = root * semiToRatio(semi) * 2;
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0, time);
      vg.gain.linearRampToValueAtTime(0.085, time + 0.6);
      vg.gain.linearRampToValueAtTime(0, time + dur);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900 + this.danger * 1600;
      o.connect(vg); vg.connect(f); f.connect(g);
      o.start(time); o.stop(time + dur + 0.05);
    }
  }

  _bass(root, time, s) {
    const g = this.layerGain.bass;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = root / 2;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(260, time);
    f.frequency.exponentialRampToValueAtTime(90, time + 0.22);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, time);
    vg.gain.exponentialRampToValueAtTime(s === 0 ? 0.5 : 0.32, time + 0.01);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    o.connect(f); f.connect(vg); vg.connect(g);
    o.start(time); o.stop(time + 0.3);
  }

  _arp(degree, time, step) {
    const g = this.layerGain.arp;
    const tones = this._chordTones(degree);
    // Each band reshapes the figure: rising, then wider, then broken, then
    // driving. Same harmony, audibly different music.
    const SHAPES = [
      [0, 1, 2, 1],
      [0, 2, 1, 2, 0, 1, 2, 1],
      [2, 0, 1, 0, 2, 1, 0, 2],
      [0, 2, 1, 2, 1, 0, 2, 1],
    ];
    const shape = SHAPES[this.band] || SHAPES[0];
    const oct = this.band >= 2 && Math.floor(step / 2) % 4 === 3 ? 12 : 0;
    const seq = shape.map((i) => tones[i] + (i === 2 ? 12 : 0) + oct);
    const o = this.ctx.createOscillator();
    o.type = this.band >= 2 ? 'sawtooth' : 'square';
    o.frequency.value = this._chordRoot(degree) * semiToRatio(seq[Math.floor(step / 2) % seq.length]) * 4;
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, time);
    vg.gain.exponentialRampToValueAtTime(0.1, time + 0.006);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 1.2;
    o.connect(vg); vg.connect(f); f.connect(g);
    o.start(time); o.stop(time + 0.2);
  }

  // A hook: one bar of melody per sector, played on detuned saws over the
  // progression. An arpeggio is texture; this is the part you hum.
  _hook(degree, time, s) {
    const motif = HOOKS[this.band];
    if (!motif) return;
    const d = motif[s];
    if (d == null) return;
    const g = this.layerGain.lead;
    const base = this._chordRoot(degree) * 4;
    const freq = base * semiToRatio(this._degree(degree + d) - this._degree(degree));
    const dur = this.spb * (this.band >= 3 ? 0.5 : 0.7);

    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4200 + this.danger * 2600, time);
    f.Q.value = 3;
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, time);
    vg.gain.exponentialRampToValueAtTime(0.22, time + 0.012);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    f.connect(vg); vg.connect(g);

    for (const detune of [-7, 7]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(time); o.stop(time + dur + 0.05);
    }
  }

  _drums(s, time) {
    const g = this.layerGain.drums;
    if (s % 8 === 0) this._kick(time, g);
    if (this.band >= 2 && s === 14) this._kick(time, g);      // pickup
    if (s === 4 || s === 12) this._snare(time, g);
    if (this.band >= 1 && (s === 7 || s === 15)) this._snare(time, g);
    // Straight eighths, then sixteenths once the sky turns.
    const hatEvery = this.band >= 1 ? 1 : 2;
    if (s % hatEvery === 0) this._hat(time, g, s % 4 === 0 ? 0.16 : 0.07);
  }

  _kick(time, dest) {
    // Duck the melodic layers and let them swell back before the next kick.
    if (this.pumpAmount > 0.01) {
      const p = this.pump.gain;
      p.cancelScheduledValues(time);
      p.setValueAtTime(1 - this.pumpAmount, time);
      p.linearRampToValueAtTime(1, time + this.spb * 0.55);
    }
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.11);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.9, time);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    o.connect(vg); vg.connect(dest);
    o.start(time); o.stop(time + 0.32);
  }

  _noise(time, dur, dest, gain, filterType, freq, Q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = Q;
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(gain, time);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f); f.connect(vg); vg.connect(dest);
    src.start(time); src.stop(time + dur + 0.02);
  }

  _snare(time, dest) { this._noise(time, 0.16, dest, 0.4, 'highpass', 1400); }
  _hat(time, dest, g) { this._noise(time, 0.045, dest, g, 'highpass', 7000); }

  // ---- gameplay sounds --------------------------------------------------

  // Correct answer. The note is a tone of the chord currently sounding, climbing
  // one chord tone per combo step, so a streak plays a melody that fits the
  // backing. `power` (0.35..1.65) weights the hit: bigger problems ring lower,
  // longer and wetter.
  correct(combo, x = 640, pw = 1) {
    if (!this.ready) return;
    const t = this._nextEighth();
    const tones = this._chordTones(this.chordDegree);
    const idx = Math.max(0, combo - 1);
    const oct = Math.min(Math.floor(idx / tones.length), 2);
    const semi = tones[idx % tones.length] + 12 * oct;
    // Heavier problems drop the register so they land with more weight.
    const base = this._chordRoot(this.chordDegree) * 4 * semiToRatio(-Math.round(pw * 5));
    const freq = base * semiToRatio(semi);
    const dest = this._panned(x, 0.22 + pw * 0.2);

    const dur = 0.4 + pw * 0.3;
    for (const [type, mul, gain] of [['triangle', 1, 0.34], ['sine', 2, 0.13], ['sine', 0.5, 0.1 * pw]]) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0.0001, t);
      vg.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t + 0.008);
      vg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(vg); vg.connect(dest);
      o.start(t); o.stop(t + dur + 0.05);
    }
    this._noise(t, 0.06 + pw * 0.05, dest, 0.16 + pw * 0.1, 'highpass', 3800);
  }

  // Wrong answer. Soft detuned thud, never a buzzer -- the punishment is that
  // the beast gets closer, not that the game scolds you.
  wrong(x = 640) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const dest = this._panned(x, 0.1);
    for (const f of [92, 96.5]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.28);
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0.0001, t);
      vg.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
      vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      o.connect(vg); vg.connect(lp); lp.connect(dest);
      o.start(t); o.stop(t + 0.34);
    }
  }

  fire(x = 640) {
    if (!this.ready) return;
    this._noise(this.ctx.currentTime, 0.09, this._panned(x), 0.13, 'bandpass', 1100, 2.5);
  }

  // An orb reaching the dome. Pitch rises with coverage, so filling the shield
  // walks up a scale across the whole run.
  absorb(x, coverage = 0) {
    if (!this.ready) return;
    const t = this._nextEighth();
    const tones = this._chordTones(this.chordDegree);
    const semi = tones[Math.floor(coverage * tones.length * 3) % tones.length] + 24;
    const freq = this._chordRoot(this.chordDegree) * 4 * semiToRatio(semi);
    const dest = this._panned(x, 0.4);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.exponentialRampToValueAtTime(0.09, t + 0.004);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(vg); vg.connect(dest);
    o.start(t); o.stop(t + 0.26);
  }

  // A beast reaching the surface: sub sweep, impact noise, music ducked.
  land(x = 640, pw = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const dest = this._panned(x, 0.5);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130 * (1.4 - pw * 0.4), t);
    o.frequency.exponentialRampToValueAtTime(26, t + 0.9);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.9, t);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(vg); vg.connect(dest);
    o.start(t); o.stop(t + 1.15);
    this._noise(t, 0.5 + pw * 0.3, dest, 0.5, 'lowpass', 700);
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(0.12, t);
    this.musicBus.gain.setTargetAtTime(1, t + 0.35, 0.5);
  }

  // A rising sweep through the held silence, landing on the next wave. The
  // build is what makes the speed increase read as an event rather than a
  // number quietly going up.
  riser(delay = 1.2, dur = 1.05) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    noise.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.26, t + dur * 0.92);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    noise.connect(bp); bp.connect(ng); ng.connect(this.sfxBus);
    noise.start(t); noise.stop(t + dur + 0.05);

    // A pitched sweep under it, so the build has a note as well as air.
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(this._chordRoot(0), t);
    o.frequency.exponentialRampToValueAtTime(this._chordRoot(0) * 8, t + dur);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.13, t + dur * 0.9);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    o.connect(lp); lp.connect(og); og.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // The downbeat the riser was climbing to.
  drop() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._kick(t, this.layerGain.drums);
    this._noise(t, 0.5, this.sfxBus, 0.3, 'lowpass', 2600);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.6, t);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(vg); vg.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.65);
    // Snap the pump wide open so the first bar lands hard.
    if (this.pump) {
      this.pump.gain.cancelScheduledValues(t);
      this.pump.gain.setValueAtTime(1, t);
    }
  }

  // Cleared a wave without a miss: the progression resolves to the tonic.
  resolve() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.05;
    const tones = [...this._chordTones(0), 12, this._degree(4) + 12];
    tones.forEach((semi, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = ROOT * 4 * semiToRatio(semi);
      const vg = this.ctx.createGain();
      const at = t + i * 0.055;
      vg.gain.setValueAtTime(0.0001, at);
      vg.gain.exponentialRampToValueAtTime(0.2, at + 0.01);
      vg.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
      const send = this.ctx.createGain();
      send.gain.value = 0.7;
      o.connect(vg);
      vg.connect(this.sfxBus);
      vg.connect(send);
      send.connect(this.verb);
      o.start(at); o.stop(at + 1.6);
    });
  }

  // Overcharge beam discharging.
  beam(x = 640) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const dest = this._panned(x, 0.45);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(5200, t + 0.4);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.exponentialRampToValueAtTime(0.36, t + 0.03);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(f); f.connect(vg); vg.connect(dest);
    o.start(t); o.stop(t + 0.75);
    this._noise(t, 0.5, dest, 0.24, 'highpass', 2200);
  }

  // Overcharge reaching full.
  charged() {
    if (!this.ready) return;
    const t = this._nextEighth();
    [0, 7, 12].forEach((semi, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = ROOT * 8 * semiToRatio(semi);
      const vg = this.ctx.createGain();
      const at = t + i * 0.04;
      vg.gain.setValueAtTime(0.0001, at);
      vg.gain.exponentialRampToValueAtTime(0.13, at + 0.005);
      vg.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      o.connect(vg); vg.connect(this.sfxBus);
      o.start(at); o.stop(at + 0.45);
    });
  }

  gameOver() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.silentUntil = t + 6;
    for (const k in this.layerGain) this.layerGain[k].gain.setTargetAtTime(0, t, 0.4);
    [0, 0.18, 0.36].forEach((d, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 330 * semiToRatio(-i * 4);
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0.0001, t + d);
      vg.gain.exponentialRampToValueAtTime(0.3, t + d + 0.01);
      vg.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9);
      const send = this.ctx.createGain();
      send.gain.value = 0.8;
      o.connect(vg);
      vg.connect(this.sfxBus);
      vg.connect(send);
      send.connect(this.verb);
      o.start(t + d); o.stop(t + d + 0.95);
    });
  }

  restart() {
    if (!this.ready) return;
    this.silentUntil = 0;
    this.modeBlend = 1.5;
  }
}
