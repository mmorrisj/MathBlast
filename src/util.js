// Small shared math/format helpers. No dependencies anywhere in this project.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inverseLerp = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));

// Frame-rate independent approach-to-target. `rate` is roughly "fraction closed per second".
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
export const randInt = (a, b) => Math.floor(rand(b + 1, a));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

// Overshoot-and-settle. Used for the answer-entry squash/stretch.
export function easeOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
}

// Starts a new path. For adding many rects to one path, use addRoundRect --
// calling this in a loop silently discards every rect but the last.
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  addRoundRect(ctx, x, y, w, h, r);
}

// Appends to the current path without resetting it.
export function addRoundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// hsl string helper keeps the palette readable at call sites.
export const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

// Maps a problem's numeric magnitude onto the ~0.4..1.6 "power" scale that every
// impact effect keys off: explosion radius, ring count, orb payout, hitstop,
// shake and the pitch of the kill tone. Logarithmic, because 12x12 should feel
// bigger than 2x3 without being thirty-six times bigger.
export function power(magnitude) {
  const m = Math.max(2, magnitude);
  return clamp(0.32 + (Math.log2(m) - 1) / 4.2, 0.35, 1.65);
}

export function isPrime(n) {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
  return true;
}

// Proper divisors greater than 1 and less than n.
export function properFactors(n) {
  const out = [];
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) {
      out.push(i);
      if (i !== n / i) out.push(n / i);
    }
  }
  return out.sort((a, b) => a - b);
}

export const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
