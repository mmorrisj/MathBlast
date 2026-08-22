# MathBlast

A 90s-arcade math defence game rebuilt with modern graphics and audio. Beasts
descend toward your planet; the only way to stop one is to solve it.

![MathBlast in play](docs/screenshot.png)

## The design rule

> The math should *be* the graphics, not decorate them.

A `7 × 8` beast is literally a 7-by-8 lattice of glowing cells. If a player is
stuck they can count the grid, so multiplication looks like area. Solving it runs
a diagonal collapse wave through the lattice, which means the kill animation is
also a picture of the array being consumed.

## Running it

No build step and no dependencies.

```bash
npm start          # -> http://localhost:5173
```

Any static file server works; `python3 -m http.server` is fine too. It must be
served over HTTP rather than opened as a `file://` URL, because the code uses ES
modules.

### Controls

| Key | Action |
| --- | --- |
| `0`–`9` | Type the answer to the highlighted beast |
| `Enter` | Fire |
| `Backspace` | Delete a digit &nbsp;·&nbsp; `Esc` clear |
| `P` / `M` | Pause / mute |
| `Q` | Cycle graphics quality (also `?q=low\|medium\|high`) |

## What's in the slice

**The shield is the score.** Every correct answer welds a hexagonal plate onto
the dome, so accumulated competence is a physical structure. It also pays off
mechanically: an intact plate absorbs a landing that would otherwise cost a core.
Wrong answers crack plates. A beast that gets through leaves a permanent scar on
the surface.

**Wrong answers never buzz.** The beast lurches closer and the combo resets, but
there is no harsh error tone and the problem stays on screen. The punishment is
proximity, not a scolding.

**Correct answers play a melody.** Each solve plays the next degree of an A-minor
pentatonic scale, climbing an octave every five, so a streak is an ascending
tune. Every gameplay sound is quantized to the 8th-note grid, which is most of
the difference between "arcade noise" and "you are playing the track". The music
is four synthesized stems that fade in with danger — silence at the top of the
screen, drums by the time something is about to land.

**The near-miss frame.** Past 86% descent the game drops to ~32% time scale and
drains the world to greyscale, then redraws the problem and your input in full
colour on top. It is the moment the whole game is built around.

![Near-miss slow motion](docs/near-miss.png)

**Hitstop.** A 75ms near-freeze on every kill. Cheap, and most of what
"satisfying" means.

**Adaptive difficulty.** Every fact gets a record: an EMA of your solve time plus
a miss count, persisted to `localStorage`. Spawn weight is derived from that, so
the facts you are slowest on appear most often. The game-over screen names them.

## Architecture

```
index.html          canvas + letterbox shell
serve.js            zero-dependency static server
src/
  main.js           game loop, wave/spawn logic, hit resolution
  audio.js          synthesized music + beat-quantized SFX (no audio assets)
  problems.js       adaptive fact table and weighted problem generation
  quality.js        frame-time-driven effect tiers
  util.js           math/easing helpers
  entities/         beast (the lattice), shield (dome + planet), projectile/turret
  fx/               camera (shake, hitstop, slow motion), particle pool
  render/           post-processing chain, parallax starfield
  ui/               HUD and overlay screens
```

Rendering is Canvas2D at a fixed 1280×720, drawn straight into the visible canvas
and letterboxed by CSS. A few notes on why it is shaped this way:

- **No intermediate scene buffer.** An unconditional full-resolution copy cost
  ~15ms/frame on a software rasteriser. Post effects run in place instead.
- **Chromatic aberration rides the bloom layer**, assembled at quarter
  resolution, so the frame pays for exactly one full-res composite whether or not
  CA is active. It is also closer to how real lenses fringe: highlights split,
  flat mid-tones don't.
- **The nebula is baked** into a full-res cache refreshed five times a second.
  It breathes at 0.35Hz, so nobody can see the update rate.
- **The backdrop is drawn outside the camera transform**, because it is exactly
  screen-sized and zoom or shake would otherwise expose bare canvas at the edges.
- **Quality adapts** to measured frame intervals, stepping bloom, aberration,
  desaturation and particle counts down and back up with hysteresis.

Measured under a software rasteriser (no GPU), worst case — full danger, slow
motion active: **high 23.9ms · medium 15.8ms · low 4.6ms**. On any
GPU-accelerated canvas the full-resolution composites that dominate the high tier
are close to free.

## Next

Ideas from the original design that this slice does not yet cover:

- **Number splitting.** Hit a `48` asteroid with a factor and it splits into two
  chunks physically proportional to `6` and `8`. Primes glow red and refuse to
  split, teaching primality without a line of text.
- **Fraction beasts** as cracked crystal shells — `3/4` is a sphere with a
  quarter missing, and equivalent fractions visibly fit the same hole.
- **Negative "voidlings"** that rise instead of falling and annihilate on
  contact with positive shots.
- **Boss equations** — a three-stage shell where each stage is one step of
  solving `3x + 7 = 22`.
- **Overcharge**: solving faster than your rolling average charges a beam that
  clears a column, rewarding fluency rather than mere correctness.
- **Answer by shooting** — candidate answers orbit as drones you aim at, so the
  game works on touch and gamepad.
