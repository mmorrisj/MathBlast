// Difficulty tiers.
//
// Each tier is a different curriculum, not the same problems with a speed
// multiplier: Easy is grade-3 arithmetic, Medium is the grade 4-6 material the
// game shipped with, Hard is grade-7 work. A tier owns which beasts appear,
// how their numbers are drawn, how fast they fall, and what its boss asks.

export const TIERS = [
  {
    id: 'easy',
    name: 'EASY',
    grade: 'Grade 3',
    blurb: 'adding and taking away, times tables to 9',
    speed: 0.78,              // multiplies the wave descent rate
    waveSize: 0.85,
    multMax: 9,               // single-digit multiplication only
    addMax: 60,
    boss: 'missing',          // ? + 12 = 30
  },
  {
    id: 'medium',
    name: 'MEDIUM',
    grade: 'Grades 4–6',
    blurb: 'times tables, factors and primes, fractions, negatives',
    speed: 1,
    waveSize: 1,
    multMax: 12,
    addMax: 0,
    boss: 'onestep',          // 3x + 7 = 22
  },
  {
    id: 'hard',
    name: 'HARD',
    grade: 'Grade 7',
    blurb: 'integers, fraction sums, percents, powers, two-step equations',
    speed: 1.18,
    waveSize: 1.15,
    multMax: 12,
    addMax: 0,
    boss: 'twostep',          // 3x - 7 = 20, and negative solutions
  },
];

export const DEFAULT_TIER = 'medium';

export function tierById(id) {
  return TIERS.find((t) => t.id === id) || TIERS.find((t) => t.id === DEFAULT_TIER);
}

// Relative spawn weights, per tier, widening as waves go by. Returning weights
// rather than a fixed schedule keeps every wave a mix rather than a block of
// one kind.
export function roster(tier, wave) {
  if (tier.id === 'easy') {
    // No negatives here: grade 3 has not met them, so the roster stays inside
    // adding, taking away and single-digit times tables.
    const r = [['add', 10], ['sub', 8]];
    if (wave >= 2) r.push(['mult', 6 + Math.min(wave, 9)]);
    return r;
  }
  if (tier.id === 'hard') {
    const r = [['mult', 5], ['integer', 9], ['power', 6]];
    if (wave >= 2) r.push(['split', 5 + Math.min(wave, 6)]);
    if (wave >= 2) r.push(['percent', 6 + Math.min(wave, 5)]);
    if (wave >= 3) r.push(['fracop', 6 + Math.min(wave, 6)]);
    return r;
  }
  // Medium: the roster the game shipped with.
  const r = [['mult', 10]];
  if (wave >= 3) r.push(['split', 4 + Math.min(wave, 8)]);
  if (wave >= 5) r.push(['void', 3 + Math.min(wave - 4, 6)]);
  if (wave >= 6) r.push(['fraction', 3 + Math.min(wave - 5, 6)]);
  return r;
}

export function pickKind(tier, wave) {
  const r = roster(tier, wave);
  let total = 0;
  for (const [, w] of r) total += w;
  let roll = Math.random() * total;
  for (const [kind, w] of r) {
    roll -= w;
    if (roll <= 0) return kind;
  }
  return r[0][0];
}
