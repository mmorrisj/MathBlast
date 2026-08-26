// Which boss shows up, and when.
//
// A boss every five waves, in two tiers. The tens are Leviathans -- the full
// set piece, camera pulled back, a remnant left behind. The fives are Wardens:
// one idea, over quickly. That alternation is what keeps the tens feeling like
// events; ten equally loud encounters would just be a boss rush with sums in
// it.
//
// Past wave fifty the roster cycles rather than inventing an eleventh boss.
// Ten distinct encounters is already a lot of surface area, and a second pass
// at the Hydra with a deeper tree is a better fight than a thin new idea.

import { Kraken } from './kraken.js';
import { Bulwark, Twins, Remainder, Cipher, Nought } from './wardens.js';
import { Hydra, Balance, Prism, Echo } from './leviathans.js';

export { Encounter, DemandBeast } from './base.js';
export { Kraken, Bulwark, Twins, Remainder, Cipher, Nought, Hydra, Balance, Prism, Echo };

const WARDENS = [Bulwark, Twins, Remainder, Cipher, Nought];
const LEVIATHANS = [Kraken, Hydra, Balance, Prism, Echo];

// All ten, in the order a run meets them. Arcade's last wave runs the whole
// roster back to back, which is the only place this order is load-bearing --
// and it is the right order, because it is the one the player learned them in.
export const ROSTER = [Bulwark, Kraken, Twins, Hydra, Remainder,
                       Balance, Cipher, Prism, Nought, Echo];

export const isBossWave = (wave) => wave >= 5 && wave % 5 === 0;
export const isLeviathan = (wave) => wave >= 10 && wave % 10 === 0;
// By class rather than by wave. During the gauntlet every guardian arrives on
// wave fifty, so asking the wave number would give all ten the full Leviathan
// treatment -- the camera pull-back and the long announcement -- and lose the
// difference between a Warden and a set piece on the one wave it matters most.
export const isLeviathanBoss = (Cls) => LEVIATHANS.includes(Cls);

// The class due on this wave, or null on an ordinary one.
export function bossFor(wave) {
  if (!isBossWave(wave)) return null;
  return isLeviathan(wave)
    ? LEVIATHANS[(wave / 10 - 1) % LEVIATHANS.length]
    : WARDENS[Math.floor(wave / 10) % WARDENS.length];
}

// Built and placed. The Echo is the only one that needs anything from outside
// itself, and what it needs is the player's own record of getting things wrong.
export function makeBossOf(Cls, wave, x, y, skill) {
  if (!Cls) return null;
  if (Cls === Echo) return new Echo(x, y, wave, skill ? skill.weakest(6) : []);
  if (Cls === Kraken) return new Kraken(x, y, wave, 5 + Math.floor(wave / 10));
  return new Cls(x, y, wave);
}

// Where each one sits comes off the class -- `Cls.originY` -- because what has
// to fit underneath differs: the Kraken needs room for an orbit, the Hydra for
// three rows of heads, a Warden for neither.
