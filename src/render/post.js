// Post-processing, applied in place on the display canvas.
//
// The scene is rendered straight into the visible canvas -- an intermediate
// full-res scene buffer costs a ~1MP copy every frame, which dominated the frame
// budget on software rasterisers. Everything here works either on the canvas
// itself or on a quarter-res bloom buffer.
//
// Chromatic aberration rides the bloom layer rather than the whole frame. That
// is both far cheaper and closer to how real lenses fringe: highlights split,
// flat mid-tones don't.

import { clamp } from '../util.js';

const make = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

export class Post {
  constructor(w, h) {
    this.canFilter = (() => {
      const c = make(4, 4).getContext('2d');
      c.filter = 'blur(2px)';
      return c.filter === 'blur(2px)';
    })();
    this.resize(w, h);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.div = 4;
    const bw = Math.max(1, Math.floor(w / 4));
    const bh = Math.max(1, Math.floor(h / 4));
    this.bloomA = make(bw, bh);   // bright-pass
    this.bloomB = make(bw, bh);   // blurred
    this.bloomC = make(bw, bh);   // composited (bloom + channel split)
    this.tintA = make(bw, bh);    // red-shifted copy
    this.tintB = make(bw, bh);    // cyan-shifted copy
    this._vig = null;
    this._vigCanvas = null;
  }

  // Bloom buffer divisor. Larger = cheaper and softer; the quality manager
  // raises this on machines that can't hold frame rate.
  setBloomDivisor(div) {
    if (this.div === div) return;
    this.div = div;
    const bw = Math.max(1, Math.floor(this.w / div));
    const bh = Math.max(1, Math.floor(this.h / div));
    this.bloomA = make(bw, bh);
    this.bloomB = make(bw, bh);
    this.bloomC = make(bw, bh);
    this.tintA = make(bw, bh);
    this.tintB = make(bw, bh);
  }

  // `out` is the display context, already holding the rendered scene.
  apply(out, { bloom = 0.9, aberration = 0, desat = 0, vignette = 0.55 } = {}) {
    if (desat > 0.001) this._desaturate(out, desat);
    if (bloom > 0.01) this._bloom(out, bloom, aberration);
    if (vignette > 0) this._vignette(out);
  }

  // 'saturation' blend keeps the backdrop's hue and luminance but takes the
  // source's saturation -- flat grey drains the colour without touching contrast.
  _desaturate(out, amount) {
    out.save();
    out.globalCompositeOperation = 'saturation';
    out.globalAlpha = clamp(amount, 0, 1);
    out.fillStyle = 'hsl(0, 0%, 50%)';
    out.fillRect(0, 0, this.w, this.h);
    out.restore();
  }

  _bloom(out, strength, aberration) {
    const a = this.bloomA.getContext('2d');
    const b = this.bloomB.getContext('2d');
    const { width: bw, height: bh } = this.bloomA;

    a.globalCompositeOperation = 'source-over';
    a.clearRect(0, 0, bw, bh);
    a.drawImage(out.canvas, 0, 0, bw, bh);
    // Squaring the image approximates an HDR bright-pass: dim pixels fall away
    // fast, highlights survive. No pixel readback required.
    a.globalCompositeOperation = 'multiply';
    a.drawImage(this.bloomA, 0, 0);
    a.globalCompositeOperation = 'source-over';

    b.clearRect(0, 0, bw, bh);
    if (this.canFilter) {
      b.filter = 'blur(4px)';
      b.drawImage(this.bloomA, 0, 0);
      b.filter = 'blur(11px)';
      b.drawImage(this.bloomA, 0, 0);
      b.filter = 'none';
    } else {
      b.globalAlpha = 0.25;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) b.drawImage(this.bloomA, dx, dy);
      b.globalAlpha = 1;
    }

    // The channel split is assembled at bloom resolution so the frame still pays
    // for exactly one full-resolution composite whether or not CA is active.
    let src = this.bloomB;
    if (aberration > 0.004) {
      const off = (aberration * 10) / this.div;
      const c = this.bloomC.getContext('2d');
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, bw, bh);
      c.globalCompositeOperation = 'lighter';
      this._tint(this.tintA, '#ff2a2a');
      this._tint(this.tintB, '#2affff');
      c.globalAlpha = 0.75;
      c.drawImage(this.tintA, -off, 0);
      c.drawImage(this.tintB, off, 0);
      c.globalAlpha = 0.45;
      c.drawImage(this.bloomB, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      src = this.bloomC;
    }

    out.save();
    out.globalCompositeOperation = 'lighter';
    out.imageSmoothingEnabled = true;
    out.globalAlpha = strength;
    out.drawImage(src, 0, 0, this.w, this.h);
    out.restore();
  }

  // Copy the blurred bloom and multiply it down to a single channel pair.
  _tint(dst, colour) {
    const c = dst.getContext('2d');
    const { width, height } = dst;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, width, height);
    c.drawImage(this.bloomB, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = colour;
    c.fillRect(0, 0, width, height);
    c.globalCompositeOperation = 'source-over';
  }

  // Baked once into an offscreen so the frame blits it instead of re-rasterising
  // a full-screen radial gradient every time.
  _vignette(out) {
    const { w, h } = this;
    if (!this._vigCanvas) {
      this._vigCanvas = make(w, h);
      const c = this._vigCanvas.getContext('2d');
      const g = c.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, h * 0.82);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(2,2,12,0.72)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    out.drawImage(this._vigCanvas, 0, 0);
  }
}
