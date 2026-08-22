// Player profiles and the high-score table.
//
// A profile owns its own fact history, so two people sharing a device get their
// own adaptive difficulty rather than averaging into one blurred learner. The
// score table is global across profiles, because a shared leaderboard is the
// point of having names at all.

const PROFILE_KEY = 'mathblast.profiles.v2';
const SCORE_KEY = 'mathblast.scores.v2';
const MAX_SCORES = 10;
export const MAX_NAME = 12;

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;                 // private mode, or corrupted value
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;                    // storage unavailable; the run still plays
  }
};

// Names are shown on a shared leaderboard, so keep them short and printable.
export function cleanName(raw) {
  return String(raw)
    .replace(/[^\p{L}\p{N} _.'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

export class Profiles {
  constructor() {
    const data = read(PROFILE_KEY, {});
    this.list = Array.isArray(data.list) ? data.list : [];
    this.activeId = data.activeId || null;
    if (!this.list.some((p) => p.id === this.activeId)) {
      this.activeId = this.list.length ? this.list[0].id : null;
    }
  }

  get active() { return this.list.find((p) => p.id === this.activeId) || null; }
  get isEmpty() { return this.list.length === 0; }

  // Ids are derived from the name plus a counter rather than a timestamp or a
  // random value, so the store stays stable and testable.
  create(rawName) {
    const name = cleanName(rawName);
    if (!name) return null;
    if (this.list.some((p) => p.name.toLowerCase() === name.toLowerCase())) return null;
    let n = 0;
    let id;
    do { id = `${name.toLowerCase().replace(/\W+/g, '')}-${n++}`; }
    while (this.list.some((p) => p.id === id));

    const profile = {
      id,
      name,
      games: 0,
      bestScore: 0,
      bestWave: 0,
      bestCombo: 0,
      solved: 0,
      attempts: 0,
    };
    this.list.push(profile);
    this.activeId = id;
    this.save();
    return profile;
  }

  select(id) {
    if (!this.list.some((p) => p.id === id)) return false;
    this.activeId = id;
    this.save();
    return true;
  }

  remove(id) {
    this.list = this.list.filter((p) => p.id !== id);
    if (this.activeId === id) this.activeId = this.list.length ? this.list[0].id : null;
    this.save();
  }

  // Folds one finished run into the active profile. Returns which records fell.
  record({ score, wave, combo, solved, attempts }) {
    const p = this.active;
    if (!p) return { score: false, wave: false, combo: false };
    const beat = {
      score: score > p.bestScore,
      wave: wave > p.bestWave,
      combo: combo > p.bestCombo,
    };
    p.games++;
    p.bestScore = Math.max(p.bestScore, score);
    p.bestWave = Math.max(p.bestWave, wave);
    p.bestCombo = Math.max(p.bestCombo, combo);
    p.solved += solved;
    p.attempts += attempts;
    this.save();
    return beat;
  }

  save() { write(PROFILE_KEY, { list: this.list, activeId: this.activeId }); }
}

export class Scores {
  constructor() {
    const raw = read(SCORE_KEY, []);
    this.list = Array.isArray(raw) ? raw.slice(0, MAX_SCORES) : [];
  }

  get best() { return this.list.length ? this.list[0].score : 0; }

  // Returns the 1-based placing, or 0 if the run did not make the table.
  add({ name, score, wave, accuracy, combo, at }) {
    if (!score) return 0;
    const entry = { name, score, wave, accuracy, combo, at: at || 0 };
    this.list.push(entry);
    this.list.sort((a, b) => b.score - a.score || b.wave - a.wave);
    this.list = this.list.slice(0, MAX_SCORES);
    this.save();
    const i = this.list.indexOf(entry);
    return i < 0 ? 0 : i + 1;
  }

  save() { write(SCORE_KEY, this.list); }
}
