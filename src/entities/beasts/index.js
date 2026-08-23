// Which kind of beast a wave sends, and with what numbers.
//
// The roster comes from the difficulty tier, so Easy sends grade-3 arithmetic,
// Medium the times-tables-and-factors set, and Hard grade-7 work. Within a tier
// the roster still widens as waves go by, so the vocabulary grows with play.

import { clamp, randInt, isPrime, gcd } from '../../util.js';
import { makeProblem } from '../../problems.js';
import { pickKind, addCap } from '../../difficulty.js';
import { levelSpec } from '../../curriculum.js';
import { MultBeast } from './mult.js';
import { SplitBeast } from './split.js';
import { FractionBeast } from './fraction.js';
import { Voidling } from './voidling.js';
import { BossBeast, bossSteps } from './boss.js';
import { ArithBeast, makeArith } from './arith.js';
import { IntegerBeast, makeInteger } from './integer.js';
import { FracOpBeast, makeFracOp } from './fracop.js';
import { PercentBeast, makePercent } from './percent.js';
import { PowerBeast, makePower } from './power.js';
import { DivBeast, makeDiv } from './div.js';

export {
  MultBeast, SplitBeast, FractionBeast, Voidling, BossBeast,
  ArithBeast, IntegerBeast, FracOpBeast, PercentBeast, PowerBeast, DivBeast,
};

export const isBossWave = (wave) => wave >= 5 && wave % 5 === 0;

// A composite worth factoring, sized to the wave, with the occasional prime
// mixed in so the player has to notice the difference.
function splitNumber(wave, hard) {
  if (Math.random() < 0.28) {
    const primes = hard
      ? [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53]
      : [7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
    return primes[randInt(0, Math.min(primes.length - 1, 2 + Math.floor(wave / 2)))];
  }
  const hi = clamp(3 + Math.floor(wave / 2), 3, hard ? 12 : 9);
  return randInt(2, hi) * randInt(2, clamp(hi + 3, 3, 12));
}

function fractionPair(wave) {
  const q = randInt(3, clamp(4 + Math.floor(wave / 2), 4, 10));
  let p = randInt(1, q - 1);
  if (Math.random() < 0.5 && gcd(p, q) === 1 && q % 2 === 0) p = Math.max(1, p - (p % 2));
  return { p: Math.max(1, p), q };
}

const KIND_FOR_CONCEPT = { factor: 'split', inverse: 'void', mult: 'mult' };

// Dynamic mode hands in a {id, level} plan instead of letting the tier's
// roster roll. The level supplies the ranges, and -- for the generators whose
// only difficulty knob is the wave number -- an equivalent wave, so eleven
// generators did not have to be rewritten to take a level.
export function planToTier(tier, plan) {
  const spec = levelSpec(plan.id, plan.level);
  return {
    tier: { ...tier, ...(spec.add ? { add: spec.add } : {}),
            ...(spec.div ? { div: spec.div } : {}),
            ...(spec.multMax ? { multMax: spec.multMax } : {}),
            id: spec.hard ? 'hard' : tier.id },
    wave: spec.wave,
  };
}

export function makeBeast(tier, wave, skill, x, y, speed, plan = null) {
  const b = buildBeast(tier, wave, skill, x, y, speed, plan);
  // The level travels with the beast so the ledger can record which level the
  // answer belonged to -- without it a promotion would keep writing into the
  // row it was promoted out of.
  b.level = plan ? plan.level : 0;
  return b;
}

function buildBeast(tier, wave, skill, x, y, speed, plan) {
  const s = speed * tier.speed;
  let kind;
  if (plan) {
    const resolved = planToTier(tier, plan);
    tier = resolved.tier;
    wave = resolved.wave;
    // Two concepts are named differently from the switch case that builds
    // them. Left unmapped they would fall through to the default -- which is
    // multiplication -- and factoring and inverses would never appear at all.
    kind = KIND_FOR_CONCEPT[plan.id] || plan.id;
  } else {
    kind = pickKind(tier, wave);
  }
  switch (kind) {
    case 'add': {
      const p = makeArith('+', wave, tier.add, addCap(tier, wave));
      return new ArithBeast(p.a, p.b, p.op, x, y, s * 0.94);
    }
    case 'sub': {
      const p = makeArith('-', wave, tier.add, addCap(tier, wave));
      return new ArithBeast(p.a, p.b, p.op, x, y, s * 0.94);
    }
    case 'div': {
      const p = makeDiv(wave, tier.div);
      return new DivBeast(p.a, p.b, x, y, s * 0.9);
    }
    case 'split': {
      const n = splitNumber(wave, tier.id === 'hard');
      return new SplitBeast(n, x, y, s * (isPrime(n) ? 0.86 : 0.94));
    }
    case 'void':
      return new Voidling(randInt(2, clamp(4 + wave, 4, tier.id === 'easy' ? 9 : 15)), x, 820, s * 0.72);
    case 'fraction': {
      const { p, q } = fractionPair(wave);
      return new FractionBeast(p, q, x, y, s * 0.82);
    }
    case 'integer': {
      const p = makeInteger(wave);
      return new IntegerBeast(p.a, p.b, p.op, x, y, s * 0.86);
    }
    case 'fracop': {
      const p = makeFracOp(wave);
      return new FracOpBeast(p.p1, p.q1, p.p2, p.q2, p.op, x, y, s * 0.78);
    }
    case 'percent': {
      const p = makePercent(wave);
      return new PercentBeast(p.pct, p.total, x, y, s * 0.84);
    }
    case 'power': {
      const p = makePower(wave);
      return new PowerBeast(p.n, p.mode, x, y, s * 0.86);
    }
    case 'mult':
    default: {
      const { a, b } = makeProblem(skill, wave, tier.multMax);
      return new MultBeast(a, b, x, y, s);
    }
  }
}

export function makeBoss(tier, wave, x, y, speed) {
  return new BossBeast(bossSteps(tier.boss, wave), x, y, speed * tier.speed * 0.55);
}
