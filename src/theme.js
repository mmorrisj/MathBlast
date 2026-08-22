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

// Environment hue per wave: deep blue -> violet -> ember.
const ENV_STOPS = [250, 250, 262, 274, 288, 300, 316, 330, 344, 356];

export const theme = {
  ...PALETTES.default,
  env: ENV_STOPS[0],
  colorSafe: false,
  reducedMotion: false,
};

export function setColorSafe(on) {
  theme.colorSafe = on;
  Object.assign(theme, on ? PALETTES.colorSafe : PALETTES.default);
}

export function setThemeWave(wave) {
  const i = clamp(wave - 1, 0, ENV_STOPS.length - 1);
  const j = Math.min(i + 1, ENV_STOPS.length - 1);
  theme.env = lerp(ENV_STOPS[i], ENV_STOPS[j], 0.35);
}

export function setReducedMotion(on) { theme.reducedMotion = on; }
