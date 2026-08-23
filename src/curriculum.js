// The curriculum as a graph: what each concept needs first, and the levels it
// moves through.
//
// Levels are the important half. Shrinking a concept's share as it is mastered
// is only right if "addition" means one thing forever -- it does not. Mastering
// single-digit addition should retire *single-digit* addition and introduce
// two-digit, so the share of the old level falls to a trickle while the new one
// climbs. The ledger therefore records concept *and* level, and a promotion
// lands on an empty row, which is what makes the new material arrive.
//
// Existing generators take `wave` as their difficulty knob. Rather than rewrite
// eleven of them, a level maps to the wave number that produces equivalent
// numbers -- a bridge, documented here so it is not mistaken for a coincidence.

export const CURRICULUM = [
  { id: 'add', needs: [], levels: [
    { name: 'single digit', wave: 2, add: { lo: 1, hi0: 9, hi: 9, step: 0 } },
    { name: 'two digit', wave: 6, add: { lo: 10, hi0: 40, hi: 99, step: 4 } },
    { name: 'larger sums', wave: 14, add: { lo: 20, hi0: 99, hi: 199, step: 8 } },
  ] },
  { id: 'sub', needs: ['add'], levels: [
    { name: 'single digit', wave: 2, add: { lo: 1, hi0: 9, hi: 9, step: 0 } },
    { name: 'two digit', wave: 6, add: { lo: 10, hi0: 40, hi: 99, step: 4 } },
    { name: 'larger differences', wave: 14, add: { lo: 20, hi0: 99, hi: 199, step: 8 } },
  ] },
  { id: 'mult', needs: ['add', 'sub'], levels: [
    { name: 'tables to 5', wave: 2, multMax: 5 },
    { name: 'tables to 9', wave: 8, multMax: 9 },
    { name: 'tables to 12', wave: 16, multMax: 12 },
  ] },
  { id: 'div', needs: ['mult'], levels: [
    { name: 'sharing to 5', wave: 2, div: { divisor: 5, quotient: 5 } },
    { name: 'sharing to 9', wave: 8, div: { divisor: 9, quotient: 9 } },
    { name: 'sharing to 12', wave: 16, div: { divisor: 12, quotient: 12 } },
  ] },
  { id: 'factor', needs: ['mult'], levels: [
    { name: 'small numbers', wave: 3 },
    { name: 'to twelve', wave: 12, hard: true },
  ] },
  { id: 'inverse', needs: ['sub'], levels: [
    { name: 'to nine', wave: 3 },
    { name: 'to fifteen', wave: 12 },
  ] },
  { id: 'fraction', needs: ['div'], levels: [
    { name: 'halves and quarters', wave: 3 },
    { name: 'any denominator', wave: 12 },
  ] },
  { id: 'power', needs: ['mult'], levels: [
    { name: 'squares to 9', wave: 3 },
    { name: 'squares and roots', wave: 12 },
  ] },
  { id: 'percent', needs: ['fraction'], levels: [
    { name: 'ten, twenty-five, fifty', wave: 2 },
    { name: 'any percent', wave: 12 },
  ] },
  { id: 'fracop', needs: ['fraction'], levels: [
    { name: 'like denominators', wave: 2 },
    { name: 'unlike denominators', wave: 12 },
  ] },
  { id: 'integer', needs: ['inverse', 'mult'], levels: [
    { name: 'small negatives', wave: 3 },
    { name: 'both signs', wave: 12 },
  ] },
];

export const BY_ID = new Map(CURRICULUM.map((c) => [c.id, c]));

export const levelCount = (id) => (BY_ID.get(id) ? BY_ID.get(id).levels.length : 1);

export function levelSpec(id, level) {
  const c = BY_ID.get(id);
  if (!c) return { name: '', wave: 4 };
  return c.levels[Math.max(0, Math.min(c.levels.length - 1, level))];
}

export const levelName = (id, level) => levelSpec(id, level).name;

// A ledger row is per concept *and* level, because a promotion has to land on
// an empty row for the new material to be treated as new.
export const rowKey = (concept, level) => `${concept}@${level}`;

export function splitKey(key) {
  const i = key.lastIndexOf('@');
  if (i < 0) return { concept: key, level: 0 };
  return { concept: key.slice(0, i), level: Number(key.slice(i + 1)) || 0 };
}
