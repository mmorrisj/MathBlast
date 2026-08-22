// Synthesized audio. Everything is generated with oscillators and noise buffers,
// so the game ships with zero audio assets.
//
// Two ideas drive this file:
//   1. Every gameplay sound is quantized to the beat grid, so play *sounds* musical.
//   2. Correct answers walk up a pentatonic scale, one degree per combo step, so a
//      streak plays a melody. Wrong answers never buzz -- they just drop you back
//      to the bottom of the ladder.

import { clamp } from './util.js';

const BPM = 100;
const SPB = 60 / BPM;          // seconds per beat
const STEP = SPB / 4;          // 16th note
const LOOKAHEAD = 0.12;        // schedule this far ahead, in seconds
const TICK_MS = 25;

// A minor pentatonic, as semitone offsets from the root.
const PENT = [0, 3, 5, 7, 10];
const ROOT = 110;              // A2

const semiToRatio = (s) => Math.pow(2, s / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.step = 0;             // 16th-note counter since start
    this.nextStepTime = 0;
    this.timer = null;
    this.danger = 0;
    this.layerGain = {};
    this.noiseBuf = null;
  }

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
    this.musicBus.gain.value = 1;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;

    this.musicBus.connect(this.comp);
    this.sfxBus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // Per-layer gains. These fade in as danger rises -- the mix *is* the threat meter.
    for (const name of ['pad', 'bass', 'arp', 'drums']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.musicBus);
      this.layerGain[name] = g;
    }

    // One second of white noise, reused for hats, snares and impacts.
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.nextStepTime = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this._schedule(), TICK_MS);
    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // ---- scheduling -------------------------------------------------------

  // Time of the next 8th-note boundary. Gameplay SFX snap here so kills land on
  // the grid instead of sounding like noise over the top of the track.
  _nextEighth() {
    if (!this.ready) return 0;
    const t = this.ctx.currentTime;
    const grid = STEP * 2;
    return Math.ceil((t + 0.005) / grid) * grid;
  }

  _schedule() {
    if (!this.ready) return;
    const ctx = this.ctx;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD) {
      this._playStep(this.step, this.nextStepTime);
      this.step++;
      this.nextStepTime += STEP;
    }
  }

  setDanger(d) {
    this.danger = clamp(d, 0, 1);
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // Each stem has its own threshold, so the arrangement builds in stages.
    const targets = {
      pad: 0.5,
      bass: clamp((this.danger - 0.12) / 0.3, 0, 1) * 0.55,
      arp: clamp((this.danger - 0.42) / 0.3, 0, 1) * 0.34,
      drums: clamp((this.danger - 0.62) / 0.28, 0, 1) * 0.5,
    };
    for (const k in targets) {
      this.layerGain[k].gain.setTargetAtTime(targets[k], t, 0.35);
    }
  }

  _playStep(step, time) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    // Two-bar chord loop: Am -> F -> C -> G, one chord per bar.
    const prog = [0, -4, 3, -2];
    const chordRoot = ROOT * semiToRatio(prog[bar % prog.length]);

    if (s === 0) this._pad(chordRoot, time);
    if (s % 4 === 0 || s === 6 || s === 14) this._bass(chordRoot, time, s);
    if (s % 2 === 0) this._arp(chordRoot, time, step);
    this._drums(s, time);
  }

  _pad(root, time) {
    const g = this.layerGain.pad;
    const dur = SPB * 4;
    for (const semi of [0, 7, 12, 15]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = root * semiToRatio(semi) * 2;
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0, time);
      vg.gain.linearRampToValueAtTime(0.09, time + 0.6);
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
    const peak = s === 0 ? 0.5 : 0.32;
    vg.gain.setValueAtTime(0.0001, time);
    vg.gain.exponentialRampToValueAtTime(peak, time + 0.01);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    o.connect(f); f.connect(vg); vg.connect(g);
    o.start(time); o.stop(time + 0.3);
  }

  _arp(root, time, step) {
    const g = this.layerGain.arp;
    const idx = Math.floor(step / 2) % 8;
    const seq = [0, 3, 7, 10, 12, 10, 7, 3];
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = root * semiToRatio(seq[idx]) * 4;
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

  _drums(s, time) {
    const g = this.layerGain.drums;
    if (s % 8 === 0) this._kick(time, g);
    if (s === 4 || s === 12) this._snare(time, g);
    if (s % 2 === 0) this._hat(time, g, s % 4 === 0 ? 0.16 : 0.09);
  }

  _kick(time, dest) {
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

  // Correct answer. `combo` is 1-based; each step climbs one pentatonic degree,
  // so a long streak plays an ascending melody. Snapped to the 8th-note grid.
  correct(combo) {
    if (!this.ready) return;
    const t = this._nextEighth();
    const idx = Math.max(0, combo - 1);
    const oct = Math.min(Math.floor(idx / PENT.length), 2);
    const semi = PENT[idx % PENT.length] + 12 * oct;
    const freq = 440 * semiToRatio(semi);

    for (const [type, mul, gain, dur] of [['triangle', 1, 0.34, 0.5], ['sine', 2, 0.14, 0.34]]) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0.0001, t);
      vg.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      vg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(vg); vg.connect(this.sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
    }
    // Bright transient so the hit reads as an impact, not just a note.
    this._noise(t, 0.07, this.sfxBus, 0.18, 'highpass', 3800);
  }

  // Wrong answer. Deliberately soft: a detuned low thud, no harsh buzzer.
  // The punishment is that the beast gets closer, not that the game scolds you.
  wrong() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
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
      o.connect(vg); vg.connect(lp); lp.connect(this.sfxBus);
      o.start(t); o.stop(t + 0.34);
    }
  }

  fire() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.09, this.sfxBus, 0.13, 'bandpass', 1100, 2.5);
  }

  // A shield plate locking into place.
  plate() {
    if (!this.ready) return;
    const t = this._nextEighth();
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(2400, t + 0.05);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.exponentialRampToValueAtTime(0.1, t + 0.005);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(vg); vg.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.13);
  }

  // A beast reaching the surface: sub-bass sweep, impact noise, music ducked.
  land() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.9, t);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(vg); vg.connect(this.sfxBus);
    o.start(t); o.stop(t + 1.15);
    this._noise(t, 0.6, this.sfxBus, 0.5, 'lowpass', 700);
    // Sidechain-style duck so the impact owns the mix for a moment.
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(0.12, t);
    this.musicBus.gain.setTargetAtTime(1, t + 0.35, 0.5);
  }

  gameOver() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const k in this.layerGain) this.layerGain[k].gain.setTargetAtTime(0, t, 0.4);
    [0, 0.18, 0.36].forEach((d, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 330 * semiToRatio(-i * 4);
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0.0001, t + d);
      vg.gain.exponentialRampToValueAtTime(0.3, t + d + 0.01);
      vg.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.7);
      o.connect(vg); vg.connect(this.sfxBus);
      o.start(t + d); o.stop(t + d + 0.75);
    });
  }
}
