// Problem generation with adaptive weighting.
//
// Every fact the player meets gets a running record: an EMA of how long they take
// and how often they miss it. Spawn weight is derived from that record, so the
// facts you are slowest on show up most. It's targeted drilling wearing a costume.

import { clamp, randInt } from './util.js';

const STORE_KEY = 'mathblast.skill.v1';

export class SkillTable {
  // Scoped to a profile id, so two people sharing a device each get their own
  // adaptive difficulty instead of averaging into one blurred learner.
  constructor(profileId = null) {
    this.facts = new Map();   // "a*b" -> { a, b, ema, misses, seen }
    this.storeKey = profileId ? `mathblast.skill.v2.${profileId}` : STORE_KEY;
    this.load();
  }

  // Swap to a different player without rebuilding the game.
  useProfile(profileId) {
    this.storeKey = profileId ? `mathblast.skill.v2.${profileId}` : STORE_KEY;
    this.facts.clear();
    this.load();
  }

  key(a, b) { return `${a}*${b}`; }

  get(a, b) {
    const k = this.key(a, b);
    let f = this.facts.get(k);
    if (!f) {
      f = { a, b, ema: 4.0, misses: 0, seen: 0 };
      this.facts.set(k, f);
    }
    return f;
  }

  record(a, b, seconds, correct) {
    const f = this.get(a, b);
    f.seen++;
    if (correct) {
      // Only successful solves move the latency estimate.
      f.ema = f.ema * 0.65 + clamp(seconds, 0.3, 12) * 0.35;
    } else {
      f.misses++;
    }
    this.save();
  }

  // Higher weight == more likely to spawn. Unseen facts get a baseline so the
  // whole table stays in rotation; slow and missed facts float to the top.
  weight(a, b) {
    const k = this.key(a, b);
    const f = this.facts.get(k);
    if (!f || f.seen === 0) return 2.2;
    const slow = clamp(f.ema / 3.0, 0.25, 3.5);
    const missRate = f.misses / Math.max(1, f.seen);
    const recency = f.seen < 3 ? 1.4 : 1;
    return (0.5 + slow + missRate * 4) * recency;
  }

  // Facts worth practising, worst first. Shown on the game-over screen.
  weakest(n = 5) {
    return [...this.facts.values()]
      .filter((f) => f.seen > 0)
      .sort((x, y) => (y.misses * 3 + y.ema) - (x.misses * 3 + x.ema))
      .slice(0, n);
  }

  load() {
    try {
      const raw = localStorage.getItem(this.storeKey);
      if (!raw) return;
      for (const f of JSON.parse(raw)) this.facts.set(this.key(f.a, f.b), f);
    } catch { /* private mode, corrupted value -- start fresh */ }
  }

  save() {
    try {
      localStorage.setItem(this.storeKey, JSON.stringify([...this.facts.values()]));
    } catch { /* storage unavailable; adaptivity just won't persist */ }
  }
}

// The range of facts widens as the player clears waves.
export function tableRangeForWave(wave, max = 12) {
  const hi = clamp(4 + Math.floor(wave * 0.9), 5, max);
  return { lo: 2, hi };
}

// `max` is the tier's ceiling: single digits on Easy, twelves above that.
export function makeProblem(skill, wave, max = 12) {
  const { lo, hi } = tableRangeForWave(wave, max);
  const candidates = [];
  let total = 0;
  for (let a = lo; a <= hi; a++) {
    for (let b = 2; b <= hi; b++) {
      const w = skill.weight(a, b);
      total += w;
      candidates.push({ a, b, w });
    }
  }
  let roll = Math.random() * total;
  for (const c of candidates) {
    roll -= c.w;
    if (roll <= 0) return { a: c.a, b: c.b, answer: c.a * c.b };
  }
  const a = randInt(lo, hi), b = randInt(2, hi);
  return { a, b, answer: a * b };
}

// Multiple-choice options for pointer, touch and gamepad play. Distractors are
// the mistakes a learner actually makes -- off-by-one-group, a transposed digit,
// the sum instead of the product -- not random numbers, which are easy to
// eliminate without doing the maths.
export function makeChoices(beast) {
  const correct = beast.answerText;
  const set = new Set([correct]);
  const n = parseInt(correct, 10);

  if (beast.a != null && beast.b != null && Number.isFinite(n)) {
    for (const cand of [
      String(n + beast.a), String(n - beast.a), String(n + beast.b),
      String(beast.a + beast.b), String(n + 10), String(n - 10),
    ]) if (cand !== correct && parseInt(cand, 10) > 0) set.add(cand);
  }
  if (Number.isFinite(n)) {
    for (const d of [1, 2, 3, 5]) {
      if (set.size >= 7) break;
      if (n - d > 0) set.add(String(n - d));
      set.add(String(n + d));
    }
    // Digit transposition, the classic slip.
    if (correct.length === 2) {
      const t = correct[1] + correct[0];
      if (t !== correct && t[0] !== '0') set.add(t);
    }
  }
  if (correct.includes('/')) {
    const [p, q] = correct.split('/').map(Number);
    for (const cand of [`${q - p}/${q}`, `${p}/${q + 1}`, `${p + 1}/${q}`, `${q}/${p}`]) {
      if (cand !== correct && !cand.startsWith('0')) set.add(cand);
    }
  }

  const pool = [...set].filter((v) => v !== correct);
  // Prefer distractors close to the answer; shuffle the near ones so the same
  // three don't appear every time.
  pool.sort((x, y) => Math.abs(parseFloat(x) - parseFloat(correct)) - Math.abs(parseFloat(y) - parseFloat(correct)));
  const near = pool.slice(0, 5);
  for (let i = near.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [near[i], near[j]] = [near[j], near[i]];
  }
  const out = [correct, ...near.slice(0, 3)];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
