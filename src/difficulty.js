// Difficulty tiers.
//
// Each tier is a different curriculum, not the same problems with a speed
// multiplier: Easy is single-digit arithmetic, Medium moves into two digits and
// the times-tables-and-factors set, Hard is grade-7 work.
//
// A tier owns which beasts appear, how their numbers are drawn, how fast they
// fall, how quickly that ramps, and what its boss asks. The ramp used to live
// in main.js as `34 + wave * 4` and `3 + wave * 1.4`, shared by every tier --
// so Easy thickened as fast as Hard and was unplayable for its own audience
// within about ten waves. Each tier now sets its own, and Easy's is roughly a
// third the gradient with a ceiling, because more repetitions on the basics is
// the whole point of the tier.

export const TIERS = [
  {
    id: 'easy',
    name: 'EASY',
    grade: 'Grades 1–3',
    blurb: 'single-digit adding, taking away, times and sharing',
    speed: 0.78,              // multiplies the wave descent rate
    speedBase: 30,
    speedStep: 1.6,           // px/s a wave, before `speed`
    speedCap: 92,
    waveBase: 3,
    waveStep: 0.6,            // beasts a wave
    waveCap: 10,
    multMax: 9,               // single-digit times tables
    // Operand ranges. `hi0` is the cap at wave 1 and it grows by `step` a wave
    // up to `hi`, so a tier opens inside its range rather than at the top of it.
    add: { lo: 1, hi0: 5, hi: 9, step: 1 },
    div: { divisor: 9, quotient: 9 },
    boss: 'missing',          // ? + 12 = 30
  },
  {
    id: 'medium',
    name: 'MEDIUM',
    grade: 'Grades 4–6',
    blurb: 'two-digit sums, times tables, factors, fractions',
    speed: 1,
    speedBase: 34,
    speedStep: 3,
    speedCap: 100,
    waveBase: 3,
    waveStep: 1.1,
    waveCap: 16,
    multMax: 12,
    add: { lo: 10, hi0: 25, hi: 99, step: 3 },
    div: { divisor: 12, quotient: 12 },
    boss: 'onestep',          // 3x + 7 = 22
  },
  {
    id: 'hard',
    name: 'HARD',
    grade: 'Grade 7',
    blurb: 'integers, fraction sums, percents, powers, two-step equations',
    speed: 1.18,
    speedBase: 36,
    speedStep: 4,
    speedCap: 112,
    waveBase: 3.5,
    waveStep: 1.4,
    waveCap: 20,
    multMax: 12,
    add: { lo: 10, hi0: 40, hi: 99, step: 4 },
    div: { divisor: 12, quotient: 12 },
    boss: 'twostep',          // 3x - 7 = 20, and negative solutions
  },
  {
    // Not a curriculum of its own: it draws from the three above in a ratio
    // set by what the player has actually covered and answered well. Starts as
    // pure Easy and stays there until there is evidence to move. The live ratio
    // is shown on the title screen and in the progress report -- adaptive
    // difficulty that hides what it is doing is just an unexplained
    // difficulty spike.
    id: 'dynamic',
    name: 'DYNAMIC',
    grade: 'Adapts',
    blurb: 'starts easy and follows what you have covered',
    dynamic: true,
    // Pace is blended per run; these are the cold-start values, which are
    // Easy's, and what a caller gets if it never asks for a blend.
    speed: 0.78,
    speedBase: 30,
    speedStep: 1.6,
    speedCap: 92,
    waveBase: 3,
    waveStep: 0.6,
    waveCap: 10,
    multMax: 9,
    add: { lo: 1, hi0: 5, hi: 9, step: 1 },
    div: { divisor: 9, quotient: 9 },
    boss: 'missing',
  },
];

// The three real curricula, in order. Dynamic draws from these.
export const BASE_TIERS = TIERS.filter((t) => !t.dynamic);

export const DEFAULT_TIER = 'medium';

export function tierById(id) {
  return TIERS.find((t) => t.id === id) || TIERS.find((t) => t.id === DEFAULT_TIER);
}

// How fast beasts fall on a given wave, and how many of them. Both flatten out:
// past the cap a tier stops getting harder and the player just keeps playing,
// which is what "more practice" means for someone who is not ready to move up.
export function descentRate(tier, wave) {
  return Math.min(tier.speedCap, tier.speedBase + wave * tier.speedStep);
}

export function waveCount(tier, wave) {
  return Math.max(2, Math.round(Math.min(tier.waveCap, tier.waveBase + wave * tier.waveStep)));
}

// The cap on addition and subtraction operands for this wave.
export function addCap(tier, wave) {
  const r = tier.add;
  return Math.min(r.hi, r.hi0 + Math.floor(wave * r.step));
}

// Relative spawn weights, per tier, widening as waves go by. Returning weights
// rather than a fixed schedule keeps every wave a mix rather than a block of
// one kind.
export function roster(tier, wave) {
  if (tier.id === 'easy') {
    // No negatives here, and nothing above nine. Adding and taking away stay
    // the majority of what spawns however long the run goes: at wave 20 they
    // are still over half, which is the "focused mostly on" part.
    const r = [['add', 10], ['sub', 9]];
    if (wave >= 3) r.push(['mult', 3 + Math.min(wave - 2, 6)]);
    if (wave >= 6) r.push(['div', 2 + Math.min(wave - 5, 5)]);
    return r;
  }
  if (tier.id === 'hard') {
    const r = [['mult', 5], ['integer', 9], ['power', 6]];
    if (wave >= 2) r.push(['split', 5 + Math.min(wave, 6)]);
    if (wave >= 2) r.push(['percent', 6 + Math.min(wave, 5)]);
    if (wave >= 3) r.push(['fracop', 6 + Math.min(wave, 6)]);
    return r;
  }
  // Dynamic resolves to one of the three above before a beast is built, so a
  // roster is never asked of it. Falling through to Medium's would be a silent
  // wrong answer rather than a loud one.
  if (tier.dynamic) throw new Error('roster: dynamic must be resolved to a base tier first');
  // Medium. Two-digit adding and taking away are new here -- this is the tier
  // where the numbers get bigger rather than the ideas -- so the abstract
  // beasts arrive a couple of waves later than they used to.
  const r = [['mult', 9], ['add', 5], ['sub', 5]];
  if (wave >= 3) r.push(['split', 4 + Math.min(wave, 8)]);
  if (wave >= 4) r.push(['div', 4 + Math.min(wave - 3, 5)]);
  if (wave >= 6) r.push(['void', 3 + Math.min(wave - 5, 6)]);
  if (wave >= 8) r.push(['fraction', 3 + Math.min(wave - 7, 6)]);
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
