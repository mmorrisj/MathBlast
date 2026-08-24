// Arcade and Practice: the two modes that have an ending.
//
// The difficulty tiers weld together two independent things -- *what* math you
// are doing and *how hard* it is pushing you. Easy is not slower Medium, it is
// a different curriculum as well, which is why "easy gets too hard too fast"
// was a real complaint rather than a tuning problem. These two modes pull the
// axes apart:
//
//   Practice -- you choose the what, the levels handle the how-hard
//   Arcade   -- the what is everything, introduced in the order the
//               curriculum graph already says it has to come in
//
// Both are fifty waves and both can be *won*, which nothing else in the game
// can be. Everything else runs until you die.
//
// The important trick here is that neither mode needs a new spawn path. The
// adaptive planner already produces a weighted list of {id, level} entries and
// the whole pipeline downstream -- pickPlan, paceWave, makeBeast, the skill
// table, the ledger -- consumes that shape without caring where it came from.
// So a mode is just a different way of writing that list.

import { clamp } from './util.js';
import { CURRICULUM, BY_ID, levelCount } from './curriculum.js';

export const RUN_WAVES = 50;

// --- Arcade ----------------------------------------------------------------
//
// Walk the curriculum's `needs` graph topologically and it hands you the
// introduction order for nothing: add, sub, then multiplication, then the
// things multiplication unlocks, and so on. There are eleven concepts and nine
// boss gates between wave 5 and wave 45, so opening with add and sub and
// introducing exactly one concept after each boss fits precisely. That is why
// the schedule looks designed -- it is the graph, not a taste decision.
//
// Every entry's `needs` are satisfied by an earlier gate. Reordering this list
// without checking that will silently produce fractions before division.
//
// The waves are one *past* each boss rather than on it. A boss wave spawns no
// ordinary beasts -- the encounter is the whole wave -- so unlocking on wave 20
// announced "NEW: FACTORS" over a fight that contained no factors, and the
// first one did not appear until 21 anyway. Landing it on 21 makes the banner
// true and reads the way it should: you beat the thing, here is what you won.
export const GATES = [
  { wave: 1, id: 'add' },
  { wave: 1, id: 'sub' },
  { wave: 6, id: 'mult' },
  { wave: 11, id: 'inverse' },
  { wave: 16, id: 'div' },
  { wave: 21, id: 'factor' },
  { wave: 26, id: 'power' },
  { wave: 31, id: 'fraction' },
  { wave: 36, id: 'integer' },
  { wave: 41, id: 'percent' },
  { wave: 46, id: 'fracop' },
];

// Waves a concept stays on one level before the next rung. Fifty waves has to
// carry three rungs for the concepts that have three.
const LEVEL_EVERY = 15;

// What the gate at exactly this wave brings in, for the announcement. Two on
// wave one, one on each boss gate after.
export function unlockedAt(wave) {
  return GATES.filter((g) => g.wave === wave).map((g) => g.id);
}

export function unlockedBy(wave) {
  return GATES.filter((g) => g.wave <= wave).map((g) => g.id);
}

function entry(id, level, weight, review = false) {
  return { id, level, weight, review, locked: false, mastery: 0, overall: 0 };
}

// Plan entries for an arcade wave. Newest material is heaviest -- it is what
// the player is there to learn -- and everything older thins to a floor rather
// than switching off, so wave 50 really is a mix of all eleven.
export function arcadePlan(wave) {
  const entries = [];
  for (const g of GATES) {
    if (g.wave > wave) continue;
    const age = wave - g.wave;
    const n = levelCount(g.id);
    const level = clamp(Math.floor(age / LEVEL_EVERY), 0, n - 1);
    entries.push(entry(g.id, level, 0.34 + 1.45 * Math.exp(-age / 15)));
    // Levels already passed, kept in rotation at a trickle.
    for (let lv = level - 1; lv >= 0; lv--) {
      entries.push(entry(g.id, lv, 0.16 * Math.pow(0.6, level - lv), true));
    }
  }
  return finish(entries);
}

// --- Practice --------------------------------------------------------------
//
// Fifty waves of one thing. The concept's own level ladder is the difficulty
// ramp, so this is not fifty waves of the same problem -- addition walks single
// digit, two digit, larger sums.
//
// The catch is that some concepts are thin: percent and fraction-ops have two
// levels and nothing else, and fifty waves of pure percent is punishment. So a
// track brings its prerequisite chain along at a reducing share. That is also
// the pedagogically honest thing to do -- you cannot practise fraction
// arithmetic without doing fractions -- so the fix and the right answer are the
// same fix.

// What we actually offer. Not every curriculum node makes sense as a thing a
// child chooses: `inverse` and `factor` are real concepts but nobody sits down
// to practise "inverses", so they arrive as support inside the tracks that need
// them rather than as menu entries of their own.
export const TRACKS = [
  { id: 'add', name: 'ADDING', blurb: 'single digit up to larger sums' },
  { id: 'sub', name: 'TAKING AWAY', blurb: 'single digit up to larger differences' },
  { id: 'mult', name: 'TIMES TABLES', blurb: 'tables to five, nine, then twelve' },
  { id: 'div', name: 'SHARING', blurb: 'dividing, to five, nine, then twelve' },
  { id: 'fraction', name: 'FRACTIONS', blurb: 'halves and quarters, then any denominator' },
  { id: 'fracop', name: 'FRACTION SUMS', blurb: 'like denominators, then unlike' },
  { id: 'percent', name: 'PERCENTS', blurb: 'ten, twenty-five and fifty, then any' },
  { id: 'power', name: 'POWERS', blurb: 'squares, then squares and roots' },
  { id: 'integer', name: 'NEGATIVES', blurb: 'small negatives, then both signs' },
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];

// The top-level choice, before any difficulty or track. Campaign is what the
// game has always been; the other two are the ones with a finish line.
export const PICKER = [
  { id: 'tier', name: 'CAMPAIGN', blurb: 'endless — pick a difficulty' },
  { id: 'practice', name: 'PRACTICE', blurb: 'fifty waves of one idea' },
  { id: 'arcade', name: 'ARCADE', blurb: 'fifty waves — every concept, one at a time' },
];

// A concept's level for a given wave, spreading its rungs across the run.
function ladder(id, wave, waves = RUN_WAVES) {
  const n = levelCount(id);
  return clamp(Math.floor((wave * n) / waves), 0, n - 1);
}

export function practicePlan(id, wave) {
  const c = BY_ID.get(id);
  if (!c) return arcadePlan(wave);
  const level = ladder(id, wave);
  const entries = [entry(id, level, 1)];
  for (let lv = level - 1; lv >= 0; lv--) {
    entries.push(entry(id, lv, 0.24 * Math.pow(0.55, level - lv), true));
  }

  // The prerequisite chain, thinning with distance. Held a rung below the
  // headline concept: these are here to support the thing being practised, not
  // to become a second lesson competing with it.
  const seen = new Set([id]);
  let frontier = c.needs;
  for (let depth = 1; frontier.length && depth <= 3; depth++) {
    const next = [];
    for (const p of frontier) {
      if (seen.has(p) || !BY_ID.get(p)) continue;
      seen.add(p);
      entries.push(entry(p, ladder(p, wave, RUN_WAVES * 1.6), 0.3 * Math.pow(0.45, depth - 1)));
      next.push(...BY_ID.get(p).needs);
    }
    frontier = next;
  }
  return finish(entries);
}

function finish(entries) {
  const total = entries.reduce((n, e) => n + e.weight, 0) || 1;
  for (const e of entries) e.share = e.weight / total;
  entries.sort((a, b) => b.weight - a.weight);
  return entries;
}

// --- pacing ----------------------------------------------------------------
//
// Both modes need a tier object, because tiers own descent speed, wave size and
// the ranges the generators draw from. Neither can borrow one of the three real
// tiers: Arcade has to start gentle enough for wave-one addition and finish
// hard enough to be the ultimate challenge, which no single tier does.

export const ARCADE_TIER = {
  id: 'arcade',
  name: 'ARCADE',
  grade: 'All of it',
  blurb: 'fifty waves, every concept, one at a time',
  arcade: true,
  planned: true,
  speed: 1.02,
  speedBase: 30,
  speedStep: 1.9,
  speedCap: 118,
  waveBase: 3,
  waveStep: 0.9,
  waveCap: 16,
  multMax: 12,
  add: { lo: 1, hi0: 9, hi: 99, step: 2.4 },
  div: { divisor: 12, quotient: 12 },
  boss: 'onestep',
};

export const PRACTICE_TIER = {
  id: 'practice',
  name: 'PRACTICE',
  grade: 'One idea',
  blurb: 'fifty waves of the thing you pick',
  practice: true,
  planned: true,
  speed: 0.84,
  speedBase: 30,
  speedStep: 1.3,
  speedCap: 96,
  waveBase: 3,
  waveStep: 0.55,
  waveCap: 11,
  multMax: 12,
  add: { lo: 1, hi0: 9, hi: 99, step: 2 },
  div: { divisor: 12, quotient: 12 },
  boss: 'missing',
};

// Arcade's bosses escalate with the run rather than asking a grade-3 missing
// addend at wave 45. Practice keeps its tier's own kind throughout.
export function bossKind(tier, wave) {
  if (!tier.arcade) return tier.boss;
  if (wave <= 15) return 'missing';
  if (wave <= 35) return 'onestep';
  return 'twostep';
}

// --- the clock -------------------------------------------------------------
//
// Fifty waves can be finished by anyone who does not die, so a victory alone
// does not say much. The clock is what separates them: same fifty waves, and
// the only question left is how fast you got through. It counts only time
// actually spent playing -- paused, in a menu, or on the title screen does not
// count, or the board would rank whoever left the tab open the least.
export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Concepts, in curriculum order, that a finished arcade run covered.
export const ARCADE_ORDER = CURRICULUM.map((c) => c.id).filter((id) => GATES.some((g) => g.id === id));
