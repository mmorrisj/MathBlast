// Problem generation with adaptive weighting.
//
// Every fact the player meets gets a running record: an EMA of how long they take
// and how often they miss it. Spawn weight is derived from that record, so the
// facts you are slowest on show up most. It's targeted drilling wearing a costume.

import { clamp, randInt } from './util.js';

const STORE_KEY = 'mathblast.skill.v1';

export class SkillTable {
  constructor() {
    this.facts = new Map();   // "a*b" -> { a, b, ema, misses, seen }
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
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      for (const f of JSON.parse(raw)) this.facts.set(this.key(f.a, f.b), f);
    } catch { /* private mode, corrupted value -- start fresh */ }
  }

  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify([...this.facts.values()]));
    } catch { /* storage unavailable; adaptivity just won't persist */ }
  }
}

// The range of facts widens as the player clears waves.
export function tableRangeForWave(wave) {
  const hi = clamp(4 + Math.floor(wave * 0.9), 5, 12);
  return { lo: 2, hi };
}

export function makeProblem(skill, wave) {
  const { lo, hi } = tableRangeForWave(wave);
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
