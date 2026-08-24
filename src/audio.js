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

// Drum patterns, one per sector. Sixteen characters, one a sixteenth: '.' is a
// rest, '1'-'9' a velocity. A single loop repeated forever is what makes a
// drum machine sound like a metronome, so the kit thickens by sector and the
// last bar of every four is replaced by a fill.
const KITS = [
  { // BLUE DRIFT -- half-time and mostly air
    kick:  '8.......6.......',
    snare: '....7.......7...',
    hat:   '5...4...5...4...',
    open:  '................',
  },
  { // VIOLET REACH -- eighths on the hats, a kick pushing into the next bar
    kick:  '9.......6.....5.',
    snare: '....8.......8..2',
    hat:   '6.4.5.4.6.4.5.4.',
    open:  '..............7.',
  },
  { // EMBER FIELD -- the kick syncopates, ghost snares fill the gaps
    kick:  '9..5....7..4..6.',
    snare: '..2.8..3....8.4.',
    hat:   '6434643464346434',
    open:  '..............7.',
  },
  { // CRIMSON DEEP -- sixteenth hats, kick under everything
    kick:  '9..57.6.7.5.7.6.',
    snare: '..38..3.2.38..4.',
    hat:   '7435743574357435',
    open:  '......7.......7.',
  },
];

// The last bar of each four. Toms descend into the downbeat that follows, so
// the phrase has somewhere to arrive.
const FILLS = [
  null,
  { snare: '....8.....6.7.8.', tom: '...............9' },
  { snare: '..2.8...6.7.8...', tom: '.............899' },
  { snare: '..38..3.6.7.....', tom: '............7899' },
];

// '.' is silence, '1'-'9' map to 0.11..1.
const vel = (pat, i) => {
  const c = pat.charCodeAt(i);
  return c === 46 ? 0 : (c - 48) / 9;
};

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
    this.stark = false;           // last core: melodic layers drop away
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

    // Soft saturation on the drums. Clean synthesised hits sound like beeps;
    // a little drive is most of what makes them read as drums.
    this.drumShaper = ctx.createWaveShaper();
    this.drumShaper.curve = (() => {
      const n = 1024;
      const c = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = Math.tanh(x * 2.4) / Math.tanh(2.4);
      }
      return c;
    })();
    this.drumShaper.oversample = '2x';

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
    this.drumShaper.connect(this.layerGain.drums);
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
    // On the last core everything melodic drops away and the kit carries it
    // alone. The mix becomes the stakes.
    const stark = this.stark ? 0 : 1;
    const targets = {
      pad: 0.5 * hold * (this.stark ? 0.35 : 1),
      bass: clamp((this.danger - 0.12) / 0.3, 0, 1) * 0.55 * hold,
      arp: clamp((this.danger - 0.42) / 0.3, 0, 1) * 0.34 * hold * stark,
      // The drums used to wait for danger > 0.62 in every sector, so most of
      // a run had no percussion at all. Each sector brings them in earlier;
      // by CRIMSON DEEP the kit is simply always there.
      drums: clamp((this.danger - (0.62 - this.band * 0.17)) / 0.28, 0, 1)
             * (0.42 + this.band * 0.06) * hold,
      lead: this.band >= 1
        ? clamp((this.danger - 0.3) / 0.35, 0, 1) * (0.16 + this.band * 0.05) * hold * stark
        : 0,
    };
    for (const k in targets) {
      this.layerGain[k].gain.setTargetAtTime(targets[k], t, hold ? 0.35 : 0.12);
    }
  }

  // The Kraken surfacing: a low swell with the drums cut, then everything back
  // at once. Short, because the fight starts immediately.
  boss() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.02;
    for (const [mul, gain, dur] of [[0.5, 0.2, 2.4], [1, 0.12, 1.8], [1.5, 0.07, 1.2]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(this._chordRoot(0) * mul * 0.5, t);
      o.frequency.linearRampToValueAtTime(this._chordRoot(0) * mul, t + dur);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(160, t);
      lp.frequency.linearRampToValueAtTime(1800, t + dur);
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(gain, t + dur * 0.6);
      vg.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(lp); lp.connect(vg); vg.connect(this.sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
    }
    this._crash(t, this.drumShaper, 1);
  }

  // The Kraken going down: the shot, the detonation, and the sky ringing
  // afterwards. Longer than any other cue in the game, because it is the only
  // moment that has earned the room.
  krakenDown(x = 640) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;

    // The shot: a bright descending whistle.
    const w = this.ctx.createOscillator();
    w.type = 'sawtooth';
    w.frequency.setValueAtTime(2400, t);
    w.frequency.exponentialRampToValueAtTime(180, t + 0.28);
    const wf = this.ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 1800;
    wf.Q.value = 1.4;
    const wg = this.ctx.createGain();
    wg.gain.setValueAtTime(0.22, t);
    wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    w.connect(wf); wf.connect(wg); wg.connect(this._panned(x, 0.4));
    w.start(t); w.stop(t + 0.32);

    // The detonation: a sub drop under a long filtered roar.
    const d = t + 0.24;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, d);
    o.frequency.exponentialRampToValueAtTime(28, d + 1.1);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, d);
    og.gain.linearRampToValueAtTime(0.5, d + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, d + 1.4);
    o.connect(og); og.connect(this.comp);
    o.start(d); o.stop(d + 1.45);
    this._noise(d, 1.3, this.verb, 0.4, 'lowpass', 1600);
    this._noise(d, 0.5, this.sfxBus, 0.3, 'highpass', 900);
    this._crash(d, this.drumShaper, 1.4);

    // And the chord it resolves to, once the noise has cleared.
    const tones = [...this._chordTones(0), 12, this._degree(4) + 12];
    tones.forEach((semi, i) => {
      const at = d + 0.55 + i * 0.07;
      const so = this.ctx.createOscillator();
      so.type = 'triangle';
      so.frequency.value = this._chordRoot(0) * 2 * semiToRatio(semi);
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.0001, at);
      sg.gain.linearRampToValueAtTime(0.12, at + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
      so.connect(sg); sg.connect(this._panned(x, 0.5));
      so.start(at); so.stop(at + 1.7);
    });
  }

  // The finisher gathering: two voices starting at the ends of the dome and
  // sliding to centre as the surge runs the arc, meeting in a bright hit when
  // it reaches the cannon. `land` is the fraction of `dur` the run takes.
  surge(dur = 1.15, land = 0.72) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    const meet = t + dur * land;
    for (const side of [-1, 1]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const root = this._chordRoot(0);
      o.frequency.setValueAtTime(root * 0.75, t);
      o.frequency.exponentialRampToValueAtTime(root * 3, meet);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(240, t);
      lp.frequency.exponentialRampToValueAtTime(5200, meet);
      lp.Q.value = 6;
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0.0001, t);
      vg.gain.linearRampToValueAtTime(0.11, meet - 0.05);
      vg.gain.exponentialRampToValueAtTime(0.0001, meet + 0.18);
      o.connect(lp); lp.connect(vg);
      if (this.ctx.createStereoPanner) {
        const pan = this.ctx.createStereoPanner();
        pan.pan.setValueAtTime(side * 0.85, t);
        pan.pan.linearRampToValueAtTime(0, meet);
        vg.connect(pan); pan.connect(this.sfxBus);
      } else {
        vg.connect(this.sfxBus);
      }
      o.start(t); o.stop(meet + 0.25);
    }
    // Arrival: the pool of light under the turret.
    const a = this.ctx.createOscillator();
    a.type = 'sine';
    a.frequency.value = this._chordRoot(0) * 6;
    const ag = this.ctx.createGain();
    ag.gain.setValueAtTime(0.0001, meet);
    ag.gain.exponentialRampToValueAtTime(0.16, meet + 0.01);
    ag.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    a.connect(ag); ag.connect(this._panned(640, 0.5));
    a.start(meet); a.stop(t + dur + 0.05);
  }

  // The supernova. A rising inrush cut dead by the detonation, then the room
  // ringing. The silence in the middle is doing most of the work.
  supernova(x = 640) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    // The inrush already happened; this is the burst and its tail.
    this._noise(t, 1.9, this.verb, 0.5, 'lowpass', 2600);
    this._noise(t, 0.7, this.sfxBus, 0.34, 'highpass', 1400);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 1.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g); g.connect(this.comp);
    o.start(t); o.stop(t + 1.85);
    this._crash(t, this.drumShaper, 1.5);
    // A high shimmer left behind: the remnant, still burning.
    for (const semi of [12, 19, 24, 28]) {
      const so = this.ctx.createOscillator();
      so.type = 'sine';
      so.frequency.value = this._chordRoot(0) * 4 * semiToRatio(semi);
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t + 0.25);
      sg.gain.linearRampToValueAtTime(0.05, t + 0.5);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      so.connect(sg); sg.connect(this._panned(x, 0.6));
      so.start(t + 0.25); so.stop(t + 2.7);
    }
  }

  // The last core. Everything melodic falls away, a low swell comes up under
  // it, and the kit keeps time on its own until the run ends.
  lastStand() {
    if (!this.ready) return;
    this.stark = true;
    this.setDanger(this.danger);
    const t = this.ctx.currentTime + 0.02;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(this._chordRoot(0) * 0.5, t);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.linearRampToValueAtTime(700, t + 1.4);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(0.16, t + 0.5);
    vg.gain.linearRampToValueAtTime(0, t + 2.2);
    o.connect(lp); lp.connect(vg); vg.connect(this.sfxBus);
    o.start(t); o.stop(t + 2.3);
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
    this._drums(s, time, bar);
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
    const peak = s === 0 ? 0.5 : s < 0 ? 0.26 : 0.32;    // s < 0 is an offbeat stab
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, time);
    vg.gain.exponentialRampToValueAtTime(peak, time + 0.01);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    vg.connect(g);

    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(320, time);
    f.frequency.exponentialRampToValueAtTime(95, time + 0.22);
    f.Q.value = 4;                                       // a little squelch
    f.connect(vg);

    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = root / 2;
    o.connect(f);
    o.start(time); o.stop(time + 0.3);

    // A clean sine an octave down carries the weight the filtered saw loses.
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = root / 4;
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.0001, time);
    sg.gain.exponentialRampToValueAtTime(peak * 0.8, time + 0.012);
    sg.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
    sub.connect(sg); sg.connect(g);
    sub.start(time); sub.stop(time + 0.32);
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

  _drums(s, time, bar) {
    const g = this.drumShaper;
    const kit = KITS[this.band];
    // Fills need somewhere to be heard, so they start once the kit is full.
    const fill = this.band >= 1 && bar % 4 === 3 ? FILLS[this.band] : null;
    // A few percent of velocity wobble. Bar-identical hits are the other half
    // of why a loop sounds mechanical.
    const hum = () => 0.92 + Math.random() * 0.16;

    // A crash opens each four-bar phrase, which is most of what turns a loop
    // into a phrase.
    if (s === 0 && this.band >= 1 && bar % 4 === 0) this._crash(time, g, 0.5);

    const kv = vel(kit.kick, s);
    // Through a fill the kick keeps the first half of the bar and hands the
    // rest to the toms.
    if (kv > 0 && (!fill || s < 8)) this._kick(time, g, kv * hum());

    const sv = fill ? vel(fill.snare, s) : vel(kit.snare, s);
    if (sv > 0) {
      this._snare(time, g, sv * hum());
      // The clap only doubles accents, never ghost notes.
      if (this.band >= 2 && sv > 0.7 && !fill) this._clap(time, g, sv * 0.8);
    }

    if (fill) {
      const tv = vel(fill.tom, s);
      if (tv > 0) this._tom(time, g, 200 - s * 7, tv);
    }

    const hv = vel(kit.hat, s);
    if (hv > 0) {
      // The hats keep time through the fill -- pulling them out drops the bar
      // out instead of building it -- but step back for the toms.
      const duck = fill && s >= 8 ? 0.55 : 1;
      // Sub-millisecond drift: a hat line locked to the sample grid rings
      // like one long tone rather than a series of hits.
      this._hat(time + (Math.random() - 0.5) * 0.004, g, hv * 0.14 * duck * hum(), false);
    }
    const ov = vel(kit.open, s);
    if (ov > 0 && !fill) this._hat(time, g, ov * 0.12, true);
  }

  _kick(time, dest, level = 1) {
    // Only accented kicks drive the sidechain -- ghost kicks pumping the mix
    // sounds like a fault, not a groove.
    if (this.pumpAmount > 0.01 && level > 0.6) {
      const p = this.pump.gain;
      p.cancelScheduledValues(time);
      p.setValueAtTime(1 - this.pumpAmount, time);
      p.linearRampToValueAtTime(1, time + this.spb * 0.55);
    }
    // Two-stage pitch envelope: a fast snap from 190 to 48Hz gives the punch,
    // then a slow settle to 41 gives the body. One long slide sounds like a
    // falling tone, not a kick.
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(190, time);
    o.frequency.exponentialRampToValueAtTime(48, time + 0.05);
    o.frequency.exponentialRampToValueAtTime(41, time + 0.28);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, time);
    vg.gain.linearRampToValueAtTime(level, time + 0.004);   // no click on the way in
    // Softer kicks are shorter as well as quieter, the way a real one is.
    vg.gain.exponentialRampToValueAtTime(0.0001, time + 0.14 + level * 0.19);
    o.connect(vg); vg.connect(dest);
    o.start(time); o.stop(time + 0.35);
    // Beater click, so it cuts through on small speakers.
    this._noise(time, 0.014, dest, 0.3 * level, 'highpass', 2600);
  }

  // Filtered noise burst with two filters in series -- _noise only does one.
  _burst(time, dur, dest, gain, lo, hi, Q = 0.8) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;   // vary the grain
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hi;
    bp.Q.value = Q;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = lo;
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(gain, time);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(bp); bp.connect(hp); hp.connect(vg); vg.connect(dest);
    src.start(time); src.stop(time + dur + 0.02);
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

  // A snare is a drum plus a rattle. Noise alone has no pitch, which is why
  // filtered white noise reads as a hiss rather than a hit.
  _snare(time, dest, level = 1) {
    for (const [f, g] of [[186, 0.3], [332, 0.16]]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * 1.12, time);
      o.frequency.exponentialRampToValueAtTime(f, time + 0.02);
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(g * level, time);
      vg.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
      o.connect(vg); vg.connect(dest);
      o.start(time); o.stop(time + 0.12);
    }
    this._burst(time, 0.15, dest, 0.42 * level, 900, 2100, 0.6);
    this._burst(time, 0.09, dest, 0.34 * level, 1800, 3200, 0.7);  // crack
    this._burst(time, 0.03, dest, 0.3 * level, 4000, 6500, 0.9);   // snap
  }

  // Toms carry the fills: the kick's shape, moved up far enough to read as a
  // pitch, with a short rattle over the head.
  _tom(time, dest, freq, level = 1) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.6, time);
    o.frequency.exponentialRampToValueAtTime(freq, time + 0.06);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, time);
    vg.gain.linearRampToValueAtTime(0.42 * level, time + 0.004);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    o.connect(vg); vg.connect(dest);
    o.start(time); o.stop(time + 0.26);
    this._burst(time, 0.05, dest, 0.1 * level, 600, 1800, 0.7);
  }

  // The hat recipe with more partials, a lower fundamental and a long tail,
  // plus a noise wash underneath to stop it sounding like a ringing bell.
  _crash(time, dest, level = 1) {
    const dur = 1.6;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 6000;
    bp.Q.value = 0.4;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(level * 0.26, time);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    bp.connect(hp); hp.connect(vg); vg.connect(dest);
    for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21, 10.7, 13.1]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 62 * r;
      o.connect(bp);
      o.start(time); o.stop(time + dur + 0.02);
    }
    this._burst(time, dur * 0.7, dest, level * 0.16, 4000, 9000, 0.4);
  }

  // The 808 recipe: six squares at inharmonic ratios, band- and high-passed.
  // Noise through a highpass is the classic wrong answer here -- it has no
  // metal in it.
  _hat(time, dest, level, open = false) {
    const dur = open ? 0.3 : 0.05;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 10000;
    bp.Q.value = 0.7;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(level * 1.1, time);
    vg.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    bp.connect(hp); hp.connect(vg); vg.connect(dest);
    for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 40 * r;
      o.connect(bp);
      o.start(time); o.stop(time + dur + 0.02);
    }
  }

  // Three fast repeats then a tail -- what makes a clap a clap rather than a
  // single slap.
  _clap(time, dest, level = 1) {
    for (const d of [0, 0.012, 0.024]) {
      this._burst(time + d, 0.022, dest, 0.3 * level, 1000, 1800, 1.1);
    }
    this._burst(time + 0.03, 0.16, dest, 0.22 * level, 1100, 2000, 0.7);
  }

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

  // Time of the next bar line at least `minAhead` seconds out. The scheduler
  // keeps counting steps through a held silence, so the grid survives it.
  _nextBar(minAhead) {
    const bar = this.stepDur * 16;
    let t = this.nextStepTime + ((16 - (this.step % 16)) % 16) * this.stepDur;
    const target = this.ctx.currentTime + minAhead;
    while (t < target) t += bar;
    return t;
  }

  // The gap between waves, locked to a bar line, with the arrival scheduled at
  // the same instant. Returns seconds until that moment so the caller can hold
  // the interlude open for precisely as long as the music needs.
  //
  // This was an EDM riser: noise sweeping to 4kHz, an accelerating snare roll,
  // a sawtooth climbing a fifth, and a film-trailer sub drop on the downbeat.
  // It was the loudest thing in the game and belonged to a different one. What
  // it is now is a charge -- chord tones swelling in and a pulse accelerating
  // into the bar line. Pitched material only, no noise sweep and no roll, so it
  // reads as energy gathering rather than as a transition effect played over
  // the top of the score.
  //
  // The gain ramps are linear on purpose. An exponential ramp from 0.0001 up is
  // a factor of thousands, which stays inaudible until the last tenth and then
  // jumps -- it reads as a zip rather than a rise.
  buildUp(minSeconds = 1.6) {
    if (!this.ready) return 0;
    const now = this.ctx.currentTime;
    const dropAt = this._nextBar(minSeconds);
    const dur = dropAt - now;
    if (dur <= 0.2) return 0;
    const start = dropAt - Math.min(dur, this.spb * 4);
    const span = dropAt - start;
    const root = this._chordRoot(0);
    const tones = this._chordTones(0);

    // The swell: the tonic chord opening through a lowpass. Each voice stays
    // under 0.09 -- this sits beneath the game rather than over it.
    for (const [semi, level] of [[0, 0.09], [tones[2], 0.06], [12, 0.045]]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = root * semiToRatio(semi);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(500, start);
      lp.frequency.linearRampToValueAtTime(2600, dropAt);
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0, start);
      vg.gain.linearRampToValueAtTime(level, dropAt - 0.05);
      vg.gain.linearRampToValueAtTime(0, dropAt);
      o.connect(lp); lp.connect(vg); vg.connect(this.sfxBus);
      o.start(start); o.stop(dropAt + 0.02);
    }

    // The charge pulse: soft chord-tone blips accelerating into the downbeat,
    // spaced backwards from it so the last gap is the shortest. The rhythm
    // carries the tension; the level barely moves.
    let gap = this.stepDur * 2;
    let i = 0;
    for (let t = dropAt - gap; t > start; i++) {
      const near = 1 - (dropAt - t) / span;      // 0 at the start, 1 at the bar line
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = root * 2 * semiToRatio(tones[i % tones.length]);
      const vg = this.ctx.createGain();
      vg.gain.setValueAtTime(0.0001, t);
      vg.gain.linearRampToValueAtTime(0.03 + 0.05 * near, t + 0.006);
      vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(vg); vg.connect(this.sfxBus);
      o.start(t); o.stop(t + 0.12);
      gap = Math.max(this.stepDur * 0.5, gap * 0.82);
      t -= gap;
    }

    this._dropAt(dropAt);
    return dur;
  }

  // The downbeat the charge was gathering toward. This used to fire a 0.55-gain
  // sine falling from 170Hz to 38 with a noise wash over it. The music
  // restarting is the payoff; this only puts a floor under it.
  _dropAt(t) {
    this._kick(t, this.layerGain.drums);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.18);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.linearRampToValueAtTime(0.18, t + 0.006);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(vg); vg.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.32);
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

  // A chained kill: a chord tone struck an octave up, climbing one tone per
  // link. It rides the current chord so a chain sounds like an arpeggio in key
  // rather than a separate effect fired over the top.
  chain(x = 640, link = 0) {
    if (!this.ready) return;
    const tones = this._chordTones(this.chordDegree);
    const semi = tones[(link + 1) % tones.length] + 12;
    const t = this.ctx.currentTime + 0.005 + link * 0.05;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = this._chordRoot(this.chordDegree) * 4 * semiToRatio(semi);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.linearRampToValueAtTime(0.1, t + 0.006);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(vg);
    vg.connect(this._panned(x, 0.3));
    o.start(t); o.stop(t + 0.34);
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
    // A new run puts the melodic layers back after a last stand stripped them.
    this.stark = false;
  }
}
