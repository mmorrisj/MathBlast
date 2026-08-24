// The progress ledger: what has actually been practised, per profile.
//
// The skill table only ever recorded facts carrying an (a, b) pair -- four of
// the twelve beast types. Factoring, fractions, fraction arithmetic, percents,
// powers, additive inverses and the equation bosses recorded nothing at all, so
// half the curriculum was invisible. This records every attempt, grouped by the
// concept the beast teaches, and rolls the day up so "are they still playing"
// is answerable separately from "are they getting better".
//
// Everything is localStorage on the device. Nothing is sent anywhere.

import { clamp } from './util.js';
import { rowKey, splitKey, levelName } from './curriculum.js';

const KEY = 'mathblast.progress.v1';
const DAYS_KEPT = 120;

// Display order is curriculum order, so the page reads as a progression rather
// than as whatever the object happened to enumerate.
export const CONCEPTS = [
  { id: 'add', name: 'Addition', blurb: 'sums as base-ten blocks' },
  { id: 'sub', name: 'Subtraction', blurb: 'taking away, struck out' },
  { id: 'mult', name: 'Multiplication', blurb: 'times tables as arrays' },
  { id: 'div', name: 'Division', blurb: 'sharing into equal groups' },
  { id: 'factor', name: 'Factors & primes', blurb: 'splitting a number' },
  { id: 'fraction', name: 'Fractions', blurb: 'parts of a whole' },
  { id: 'fracop', name: 'Fraction arithmetic', blurb: 'unlike denominators' },
  { id: 'percent', name: 'Percentages', blurb: 'a percent of a total' },
  { id: 'power', name: 'Squares & roots', blurb: 'powers both ways' },
  { id: 'integer', name: 'Signed integers', blurb: 'negatives multiplied' },
  { id: 'inverse', name: 'Additive inverses', blurb: 'what cancels it out' },
  { id: 'equation', name: 'Equations', blurb: 'solving for the unknown' },
];

const CONCEPT_NAME = new Map(CONCEPTS.map((c) => [c.id, c.name]));
export const conceptName = (id) => CONCEPT_NAME.get(id) || id;

// Local date, not UTC: a run at 9pm should count as today wherever you are.
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function blank() {
  return { concepts: {}, days: {}, runs: 0, firstSeen: dayKey(), bosses: {} };
}

export class Progress {
  constructor(profileId = null) {
    this.storeKey = profileId ? `${KEY}.${profileId}` : KEY;
    this.data = blank();
    this.load();
  }

  useProfile(profileId) {
    this.storeKey = profileId ? `${KEY}.${profileId}` : KEY;
    this.data = blank();
    this.load();
  }

  _row(key) {
    return this.data.concepts[key] || (this.data.concepts[key] = {
      seen: 0, correct: 0, totalMs: 0, landed: 0, last: '',
    });
  }

  // One answered problem. `correct` false is a wrong answer, not a miss by
  // omission -- a beast that lands unanswered is recorded by `landed`.
  //
  // Keyed by concept *and* level: promoting from single-digit to two-digit
  // addition has to land on an empty row, or the adaptive weighting would
  // treat the new material as already mastered.
  record(concept, level, correct, seconds) {
    const c = this._row(rowKey(concept, level));
    c.seen++;
    if (correct) {
      c.correct++;
      // Only successful solves time anything; a wrong answer's clock is noise.
      c.totalMs += clamp(seconds, 0.2, 30) * 1000;
    }
    c.last = dayKey();

    const d = this.data.days[c.last] || (this.data.days[c.last] = { seen: 0, correct: 0 });
    d.seen++;
    if (correct) d.correct++;
    this.save();
  }

  // A beast reached the dome with its problem unanswered. Worth separating:
  // "got it wrong" and "ran out of time" are different things to a parent.
  landed(concept, level = 0) {
    const c = this._row(rowKey(concept, level));
    c.landed++;
    this.save();
  }

  // A boss went down. Kept by name and counted, so the progress page can show
  // which encounters a player has actually beaten rather than just how far
  // they got -- reaching wave 30 and beating the Balance are different facts.
  boss(title) {
    if (!title) return;
    if (!this.data.bosses) this.data.bosses = {};
    this.data.bosses[title] = (this.data.bosses[title] || 0) + 1;
    this.save();
  }

  // { title -> times beaten }, for the trophy row.
  trophies() { return { ...(this.data.bosses || {}) }; }

  startRun() {
    this.data.runs++;
    if (!this.data.firstSeen) this.data.firstSeen = dayKey();
    this.save();
  }

  // Rows keyed by `concept@level`, for the adaptive weighting.
  rowMap() {
    const m = new Map();
    for (const [key, c] of Object.entries(this.data.concepts)) {
      m.set(key, { ...c, accuracy: c.seen ? c.correct / c.seen : 0 });
    }
    return m;
  }

  // Per concept, in curriculum order, summed across its levels -- a parent
  // wants "how is subtraction going", not four rows of it. Includes concepts
  // never touched: a gap in coverage is the most useful thing on the page and
  // it cannot show as an absent row.
  summary() {
    const byConcept = new Map();
    for (const [key, c] of Object.entries(this.data.concepts)) {
      const { concept, level } = splitKey(key);
      const acc = byConcept.get(concept) || { seen: 0, correct: 0, totalMs: 0, landed: 0, last: '', top: 0 };
      acc.seen += c.seen;
      acc.correct += c.correct;
      acc.totalMs += c.totalMs;
      acc.landed += c.landed;
      if (c.last > acc.last) acc.last = c.last;
      if (c.seen > 0) acc.top = Math.max(acc.top, level);
      byConcept.set(concept, acc);
    }
    return CONCEPTS.map((meta) => {
      const c = byConcept.get(meta.id);
      const seen = c ? c.seen : 0;
      return {
        ...meta,
        seen,
        correct: c ? c.correct : 0,
        landed: c ? c.landed : 0,
        accuracy: seen ? c.correct / seen : 0,
        avgSeconds: c && c.correct ? c.totalMs / c.correct / 1000 : 0,
        last: c ? c.last : '',
        level: c ? c.top : 0,
        levelName: c && seen ? levelName(meta.id, c.top) : '',
      };
    });
  }

  // The last `n` days, oldest first, so the strip reads left to right.
  recent(n = 30, today = new Date()) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      const v = this.data.days[k];
      out.push({ day: k, seen: v ? v.seen : 0, correct: v ? v.correct : 0 });
    }
    return out;
  }

  totals() {
    let seen = 0, correct = 0;
    for (const c of Object.values(this.data.concepts)) { seen += c.seen; correct += c.correct; }
    const played = Object.keys(this.data.days).length;
    return { seen, correct, played, runs: this.data.runs,
             accuracy: seen ? correct / seen : 0 };
  }

  // Consecutive days up to and including today. Yesterday still counts as a
  // live streak: a child who has not played *yet today* has not broken it.
  streak(today = new Date()) {
    const has = (d) => Boolean(this.data.days[dayKey(d)]);
    const cur = new Date(today);
    if (!has(cur)) {
      cur.setDate(cur.getDate() - 1);
      if (!has(cur)) return 0;
    }
    let n = 0;
    while (has(cur)) { n++; cur.setDate(cur.getDate() - 1); }
    return n;
  }

  load() {
    try {
      const raw = localStorage.getItem(this.storeKey);
      if (!raw) return;
      const v = JSON.parse(raw);
      if (v && typeof v === 'object') this.data = { ...blank(), ...v };
    } catch { /* private mode or a corrupted value -- start fresh */ }
  }

  save() {
    // Trim the day log so a daily player does not grow the record without end.
    const keys = Object.keys(this.data.days).sort();
    if (keys.length > DAYS_KEPT) {
      for (const k of keys.slice(0, keys.length - DAYS_KEPT)) delete this.data.days[k];
    }
    try {
      localStorage.setItem(this.storeKey, JSON.stringify(this.data));
    } catch { /* storage unavailable; progress just will not persist */ }
  }
}
