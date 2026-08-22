// Adaptive quality. Samples real frame intervals and steps effects down when the
// machine can't hold 60fps, back up when it can. Chromebooks and older laptops
// are the target here, and they vary far too much to pick one preset up front.

const TIERS = {
  high:   { bloom: true, bloomDiv: 4, aberration: true,  desat: true,  stars: 1,    particles: 1 },
  medium: { bloom: true, bloomDiv: 6, aberration: false, desat: false, stars: 0.7,  particles: 0.7 },
  low:    { bloom: false, bloomDiv: 8, aberration: false, desat: false, stars: 0.45, particles: 0.5 },
};
const ORDER = ['low', 'medium', 'high'];

const DOWN_MS = 24;    // sustained frame interval that forces a step down
const UP_MS = 13;      // sustained interval that allows a step up
const DOWN_HOLD = 1.0;
const UP_HOLD = 5.0;

export class Quality {
  constructor(forced = null) {
    this.tier = forced && TIERS[forced] ? forced : 'high';
    this.locked = Boolean(forced);
    this.ema = 16.7;
    this.slowFor = 0;
    this.fastFor = 0;
  }

  get s() { return TIERS[this.tier]; }

  cycle() {
    const i = ORDER.indexOf(this.tier);
    this.tier = ORDER[(i + 1) % ORDER.length];
    this.locked = true;
    return this.tier;
  }

  // `dtMs` is the wall-clock interval between presented frames.
  sample(dtMs) {
    if (this.locked) return;
    // Ignore tab-switch and breakpoint spikes.
    if (dtMs > 200) return;
    this.ema = this.ema * 0.9 + dtMs * 0.1;
    const dt = dtMs / 1000;

    if (this.ema > DOWN_MS) { this.slowFor += dt; this.fastFor = 0; }
    else if (this.ema < UP_MS) { this.fastFor += dt; this.slowFor = 0; }
    else { this.slowFor = 0; this.fastFor = 0; }

    const i = ORDER.indexOf(this.tier);
    if (this.slowFor > DOWN_HOLD && i > 0) {
      this.tier = ORDER[i - 1];
      this.slowFor = 0;
      this.ema = 16.7;
    } else if (this.fastFor > UP_HOLD && i < ORDER.length - 1) {
      this.tier = ORDER[i + 1];
      this.fastFor = 0;
      this.ema = 16.7;
    }
  }
}
