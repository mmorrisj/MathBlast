// One place for the palette, so the game's signal channel stays coherent.
//
// Friendly (shield, orbs, turret) is always cool; hostile (beasts) is always
// warm. That contrast is how a player reads the screen at a glance, so waves
// never recolour it -- only the *environment* drifts, which shows progress
// without touching the thing meaning depends on.
//
// The colour-safe palette widens the friendly/hostile split onto the blue-yellow
// axis, which is the one deuteranopia and protanopia leave intact.

import { lerp, clamp } from './util.js';

const PALETTES = {
  default:   { friendly: 188, hostile: 12, void: 268, boss: 320, orb: 172 },
  colorSafe: { friendly: 214, hostile: 46, void: 288, boss: 320, orb: 200 },
};

// Progress is banded rather than smeared. Twelve degrees of hue per wave is
// invisible while you are playing; a named sector every three waves, with its
// own nebula strength and star tint, is not.
const BANDS = [
  { name: 'BLUE DRIFT',   env: 248, next: 282, nebula: 1,    star: 208 },
  { name: 'VIOLET REACH', env: 282, next: 322, nebula: 1.35, star: 268 },
  { name: 'EMBER FIELD',  env: 326, next: 350, nebula: 1.7,  star: 26 },
  { name: 'CRIMSON DEEP', env: 353, next: 366, nebula: 2.1,  star: 8 },
];
export const BAND_WAVES = 3;

export const theme = {
  ...PALETTES.default,
  env: BANDS[0].env,
  nebula: 1,
  starHue: BANDS[0].star,
  band: 0,
  bandName: BANDS[0].name,
  colorSafe: false,
  reducedMotion: false,
};

export function setColorSafe(on) {
  theme.colorSafe = on;
  Object.assign(theme, on ? PALETTES.colorSafe : PALETTES.default);
}

// The sector a wave belongs to, without changing the live theme -- the
// interlude names the sector you are about to enter, one wave ahead of itself.
export function bandNameFor(wave) {
  return BANDS[clamp(Math.floor((wave - 1) / BAND_WAVES), 0, BANDS.length - 1)].name;
}

export function setThemeWave(wave) {
  const i = clamp(Math.floor((wave - 1) / BAND_WAVES), 0, BANDS.length - 1);
  const b = BANDS[i];
  // Drift a little within the band so the jump at the boundary is a step, not
  // a cliff, and the middle of a band is not static either.
  const within = clamp(((wave - 1) % BAND_WAVES) / BAND_WAVES, 0, 1);
  theme.band = i;
  theme.bandName = b.name;
  theme.env = lerp(b.env, b.next, within * 0.55);
  theme.nebula = b.nebula * (1 + within * 0.12);
  theme.starHue = b.star;
}

export function setReducedMotion(on) { theme.reducedMotion = on; }
