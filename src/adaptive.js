// Dynamic difficulty: which *concept*, at which level, to send next.
//
// Not a blend of the three fixed tiers. The thing a learner needs is for the
// material they have mastered to recede and the material they have not to
// arrive -- so every concept-and-level carries a weight that falls as it is
// mastered, and the spawn roster is drawn from those weights. Mastering
// single-digit addition does two things at once: single-digit addition's own
// weight collapses to a trickle, and the concept promotes to two digits, whose
// row is empty and therefore heavy. The share of a concept over time is a wave
// that moves up the levels rather than a line that only falls.
//
// A concept stays out of the pool until its prerequisites are solid, so a
// child who has not met multiplication is never shown a fraction.
//
// Everything is derived from the ledger. There is no second copy to drift.

import { clamp } from './util.js';
import { CURRICULUM, levelCount, levelSpec, rowKey } from './curriculum.js';

const ENOUGH = 12;        // answers before accuracy means anything
// Deliberately not small. Twenty-five correct single-digit sums is a good
// afternoon, not mastery; forty spread over more than one sitting is closer.
const COVERED = 40;       // answers before coverage counts as full
const UNLOCK = 0.55;      // prerequisite mastery needed to open what follows
const PROMOTE = 0.8;      // mastery of a level before the next one opens
const FLOOR = 1.2;        // the current level, once mastered, still shows up
// Levels already cleared keep a thin share so the material is revisited rather
// than abandoned. The first version emitted only the current level per concept,
// so a cleared level went straight to zero -- "shrinking share" has to mean a
// trickle, not silence, or there is no spaced retrieval at all.
const REVIEW = 0.7;
const REVIEW_DECAY = 0.55;
const PEAK = 14;          // weight of something brand new
const STALE_DAYS = 21;

function daysSince(day, today) {
  if (!day) return Infinity;
  const a = new Date(`${day}T00:00:00`);
  const b = new Date(`${today}T00:00:00`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

// 0..1 for one concept at one level. Coverage and accuracy both have to be
// there; below ENOUGH answers the accuracy contributes nothing rather than
// contributing a confident wrong number.
export function levelMastery(row, today) {
  if (!row || !row.seen) return 0;
  const coverage = clamp(row.seen / COVERED, 0, 1);
  const accuracy = row.seen >= ENOUGH ? clamp((row.accuracy - 0.6) / 0.3, 0, 1) : 0;
  // Untouched for a season, treat it as rustier than the raw numbers say. A
  // week off should not matter; coming back after months should ease in.
  const stale = daysSince(row.last, today) > STALE_DAYS ? 0.6 : 1;
  return Math.min(coverage, accuracy) * stale;
}

// How far a concept has got: the highest level whose predecessors are all
// mastered. Concept mastery for the purpose of unlocking what follows is the
// mastery of that level, plus credit for the levels already cleared.
export function conceptState(rows, id, today) {
  const n = levelCount(id);
  let level = 0;
  for (; level < n - 1; level++) {
    if (levelMastery(rows.get(rowKey(id, level)), today) < PROMOTE) break;
  }
  const here = levelMastery(rows.get(rowKey(id, level)), today);
  // Progress across the whole concept, so a prerequisite counts as met once
  // the early levels are solid rather than only at the very top.
  const overall = clamp((level + here) / n, 0, 1);
  return { id, level, mastery: here, overall };
}

export function plan(progress, today) {
  const rows = progress.rowMap();
  const state = new Map();
  for (const c of CURRICULUM) state.set(c.id, conceptState(rows, c.id, today));

  const entries = [];
  for (const c of CURRICULUM) {
    const s = state.get(c.id);
    const open = c.needs.every((n) => (state.get(n) || { overall: 0 }).overall >= UNLOCK);
    if (!open) {
      entries.push({ ...s, weight: 0, locked: true, blockedBy: c.needs });
      continue;
    }
    // The curve: heavy while unmastered, a trickle once known.
    const w = FLOOR + (PEAK - FLOOR) * Math.pow(1 - s.mastery, 1.5);
    const row = rows.get(rowKey(c.id, s.level));
    // Something just unlocked or just promoted needs to actually turn up
    // rather than wait its turn behind eleven other things.
    const fresh = (!row || row.seen < 8) ? 1.5 : 1;
    entries.push({ ...s, weight: w * fresh, locked: false });

    // Every level already cleared, thinning with age. This is what makes a
    // concept's share fall away gradually instead of switching off.
    for (let lv = s.level - 1; lv >= 0; lv--) {
      entries.push({
        id: c.id, level: lv, locked: false, review: true,
        mastery: levelMastery(rows.get(rowKey(c.id, lv)), today),
        overall: s.overall,
        weight: REVIEW * Math.pow(REVIEW_DECAY, s.level - lv),
      });
    }
  }

  const total = entries.reduce((n, e) => n + e.weight, 0) || 1;
  for (const e of entries) e.share = e.weight / total;
  entries.sort((a, b) => b.weight - a.weight);
  return entries;
}

// Weighted roll over the open concepts. `rand` is injectable so a test can pin
// the outcome.
export function pickPlan(entries, rand = Math.random) {
  const open = entries.filter((e) => e.weight > 0);
  if (!open.length) return { id: 'add', level: 0 };
  let roll = rand() * open.reduce((n, e) => n + e.weight, 0);
  for (const e of open) {
    roll -= e.weight;
    if (roll <= 0) return { id: e.id, level: e.level };
  }
  return { id: open[0].id, level: open[0].level };
}

// Pace: the dynamic tier has no ramp of its own, so it borrows the wave number
// its hardest open material corresponds to. A run made of two-digit addition
// and tables-to-12 should not fall at the speed of single-digit sums.
export function paceWave(entries, wave) {
  const open = entries.filter((e) => e.weight > 0);
  if (!open.length) return Math.min(wave, 3);
  const weighted = open.reduce((n, e) => n + e.weight * levelSpec(e.id, e.level).wave, 0);
  const total = open.reduce((n, e) => n + e.weight, 0) || 1;
  // Blend the curriculum's own difficulty with how long this run has gone on.
  return clamp(weighted / total * 0.7 + wave * 0.6, 1, 30);
}

export const pct = (x) => Math.round(x * 100);

// "tables to 9 34%  ·  two digit 22%  ·  sharing to 5 18%"
export function planLabel(entries, n = 3) {
  const open = entries.filter((e) => e.share > 0.02).slice(0, n);
  if (!open.length) return 'starting with the basics';
  return open.map((e) => `${levelSpec(e.id, e.level).name} ${pct(e.share)}%`).join('  ·  ');
}
