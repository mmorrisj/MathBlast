// Which kind of beast a wave sends, and with what numbers.
//
// The roster opens up as waves go by, so the vocabulary of the game grows with
// the player: multiplication first, then factoring, then negatives, then
// fractions, with a boss equation every fifth wave.

import { clamp, rand, randInt, isPrime, gcd } from '../../util.js';
import { makeProblem } from '../../problems.js';
import { MultBeast } from './mult.js';
import { SplitBeast } from './split.js';
import { FractionBeast } from './fraction.js';
import { Voidling } from './voidling.js';
import { BossBeast } from './boss.js';

export { MultBeast, SplitBeast, FractionBeast, Voidling, BossBeast };

export const isBossWave = (wave) => wave >= 5 && wave % 5 === 0;

// Relative spawn weights per wave.
function roster(wave) {
  const r = [['mult', 10]];
  if (wave >= 3) r.push(['split', 4 + Math.min(wave, 8)]);
  if (wave >= 5) r.push(['void', 3 + Math.min(wave - 4, 6)]);
  if (wave >= 6) r.push(['fraction', 3 + Math.min(wave - 5, 6)]);
  return r;
}

function pickKind(wave) {
  const r = roster(wave);
  let total = 0;
  for (const [, w] of r) total += w;
  let roll = Math.random() * total;
  for (const [kind, w] of r) {
    roll -= w;
    if (roll <= 0) return kind;
  }
  return 'mult';
}

// A composite worth factoring, sized to the wave, with the occasional prime
// mixed in so the player has to notice the difference.
function splitNumber(wave) {
  if (Math.random() < 0.28) {
    const primes = [7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
    return primes[randInt(0, Math.min(primes.length - 1, 2 + Math.floor(wave / 2)))];
  }
  const a = randInt(2, clamp(3 + Math.floor(wave / 2), 3, 9));
  const b = randInt(2, clamp(3 + Math.floor(wave / 2), 3, 12));
  return a * b;
}

function fractionPair(wave) {
  const q = randInt(3, clamp(4 + Math.floor(wave / 2), 4, 10));
  let p = randInt(1, q - 1);
  // Bias toward fractions that reduce, so equivalence keeps showing up.
  if (Math.random() < 0.5 && gcd(p, q) === 1 && q % 2 === 0) p = Math.max(1, p - (p % 2));
  return { p: Math.max(1, p), q };
}

export function makeBeast(wave, skill, x, y, speed) {
  switch (pickKind(wave)) {
    case 'split': {
      const n = splitNumber(wave);
      return new SplitBeast(n, x, y, speed * (isPrime(n) ? 0.86 : 0.94));
    }
    case 'void': {
      // Risers start below the horizon and climb.
      return new Voidling(randInt(2, clamp(4 + wave, 4, 15)), x, 820, speed * 0.72);
    }
    case 'fraction': {
      const { p, q } = fractionPair(wave);
      return new FractionBeast(p, q, x, y, speed * 0.82);
    }
    default: {
      const { a, b } = makeProblem(skill, wave);
      return new MultBeast(a, b, x, y, speed);
    }
  }
}

export function makeBoss(wave, x, y, speed) {
  const a = randInt(2, clamp(2 + Math.floor(wave / 4), 2, 9));
  const xVal = randInt(2, clamp(3 + Math.floor(wave / 3), 3, 12));
  const b = randInt(1, clamp(5 + wave, 5, 20));
  return new BossBeast(a, b, xVal, x, y, speed * 0.55);
}

// Half-width used to keep a freshly spawned beast fully on screen.
export function halfWidthFor(wave) { return 90; }
