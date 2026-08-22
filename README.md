# MathBlast

A 90s-arcade math defence game rebuilt with modern graphics and audio. Beasts
descend toward your planet; the only way to stop one is to solve it.

![MathBlast in play](docs/screenshot.png)

## The design rule

> The math should *be* the graphics, not decorate them.

A `7 × 8` beast is a countable 7-by-8 lattice, so multiplication looks like area.
A `48` asteroid struck with `6` fractures into two chunks physically sized `6`
and `8`. A prime glows red and refuses to split, so the only way to kill it is to
name it. Nobody is told what a prime is — the rock teaches it by being
unbreakable.

## Running it

No build step and no dependencies.

```bash
npm start          # -> http://localhost:5173
npm test           # browser-driven suite (needs Playwright; skips cleanly without)
```

Any static server works. It must be served over HTTP rather than opened as a
`file://` URL, because the code uses ES modules.

### Controls

| Key | Action |
| --- | --- |
| `0`–`9`, `/`, `x` | Type the answer (`/` for fractions like `3/4`; `x` types `×` for factor pairs like `6×8`) |
| `Enter` | Fire &nbsp;·&nbsp; `Backspace` delete &nbsp;·&nbsp; `Esc` clear |
| `[` `]` or click | Choose which beast to solve; otherwise the turret auto-targets the most dangerous one |
| `Space` | Overcharge beam, once charged |
| `Tab` | Switch between typing and picking from four answers |
| `C` / `R` | Colour-safe palette / reduced motion |
| `P` / `M` / `Q` | Pause / mute / graphics quality (also `?q=low\|medium\|high`) |

Targeting is automatic until you override it. Click or tap a beast, press `[`
and `]`, or use the gamepad shoulder buttons to aim somewhere else; the lock
holds until that beast is solved, then the turret resumes defending on its own.

Touch and gamepad auto-switch to the four-answer layout: tap an orb, or use
d-pad + A, with B or RT for the beam.

## The beasts

| | |
| --- | --- |
| **Multiplication lattice** | `a × b` as a countable grid. Solving runs a diagonal collapse wave through it, so the kill animation is a picture of the array being consumed. |
| **Splitting asteroid** | Labelled `? × ? = 48`, and it accepts either half of that question: one factor (`6`) or the whole pair (`6×8`). A pair is judged on its product, so `12×9` is wrong for 48 even though `12` alone would be right. Hit a composite and it fractures into two proportionally sized rocks. Composites show fracture seams; primes show an unbreakable crystalline core. Trying to factor a prime costs nothing — the rock reveals itself as `17 is PRIME` and you name it instead. |
| **Fraction crystal** | A shell with a wedge missing, faceted at every `1/q` so the denominator is countable. Any equivalent fraction is accepted — `2/8` and `1/4` cut the same hole, and the player discovers that rather than being told. |
| **Voidling** | A negative. Rises instead of falling, drawn as a hole rather than an object. Fire its additive inverse to annihilate it; let it escape off the top and it takes shield energy with it. |
| **Boss equation** | `3x + 7 = 22`, cracked one step at a time: isolate, solve, verify. Each step shatters one of three armour rings, so the algebra and the armour come apart together. |

![A fraction crystal and a prime](docs/fraction-prime.png)

![A boss equation](docs/boss.png)

## Impact

Every explosion is scaled by the magnitude of the problem that produced it. A
`2 × 3` gets two thin rings and five orbs; a `12 × 12` gets four fat ones and
nine, with a longer hitstop, a heavier shake and a lower, wetter kill tone.

![A large impact](docs/impact.png)

The rings are drawn three times at slightly different radii in red, green and
blue, which reads as a lens distortion without ever sampling the canvas back — a
true refraction pass costs a full-resolution readback per ring, and these stack.

**Orbs carry the game's central idea.** Solving a beast releases energy that
scatters, then arcs down into the shield dome and is absorbed, each orb
depositing a share of a plate. The answer you got right becomes, visibly, the
thing that protects you later — and it pays off mechanically, because an intact
plate absorbs a landing that would otherwise cost a core.

![Orbs streaming into the dome](docs/orbs.png)

## Sound

Fully synthesized — no audio assets, not even an impulse response.

- **The combo melody is harmonised.** Each correct answer plays a tone of the
  chord *currently sounding*, climbing one chord tone per combo step. A streak
  plays a melody that fits the backing rather than sitting on top of it.
- **The mode follows the player.** Rolling accuracy indexes a list of modes from
  Phrygian to Ionian. Play well and the chord literally becomes a major triad;
  miss a few and it darkens. The soundtrack narrates competence, not just threat.
- **Tempo and progression advance with the wave** (100 → 124 BPM, four rotating
  progressions), so minute eight does not sound like minute one.
- **Everything is quantized to the beat grid**, which is most of the difference
  between "arcade noise" and "you are playing the track".
- **Four stems fade in with proximity**, making the mix double as a threat meter:
  silence at the top of the screen, drums by the time something is about to land.
- **Panned by screen position**, with a convolution reverb built from
  exponentially decaying noise, and a held breath — everything cuts, the tail
  carries — between waves.

Wrong answers never buzz. The beast lurches closer and the combo resets, but
there is no harsh error tone and the problem stays on screen. The punishment is
proximity, not a scolding.

## Feel

- **75–140ms hitstop** on kills, scaled by magnitude.
- **The near-miss frame**: past 86% descent the game drops to ~32% time scale,
  drains the world to greyscale, softens the backdrop with depth of field, and
  redraws the problem and your input in full colour on top.
- **Wave transitions are a beat**, not a banner: the camera pulls back,
  everything holds, and a clean wave gets a resolving chord and a repaired plate.
- **The planet is a character** — city lights along the limb go dark a cluster at
  a time as cores are lost, and beasts that get through leave permanent scars.
- **Overcharge** builds when you answer faster than your own rolling average,
  rewarding fluency rather than mere accuracy, and discharges as a column beam.

![Near-miss slow motion](docs/near-miss.png)

## Learning model

Every fact carries an EMA of your solve time plus a miss count, persisted to
`localStorage`. Spawn weight derives from that, so the facts you are slowest on
appear most often, and the game-over screen names them. Distractors in
four-answer mode are the mistakes learners actually make — off-by-one-group, a
transposed digit, the sum instead of the product — not random numbers, which are
easy to eliminate without doing the maths.

## Accessibility

`R` toggles reduced motion (auto-detected from `prefers-reduced-motion`), which
cuts screen shake to a tenth, halves hitstop and disables the slow-motion
punch-in. The scaling lives in the camera rather than at each call site, so no
effect can forget to honour it.

`C` toggles a colour-safe palette. Friendly is always cool and hostile always
warm — that contrast is how the screen is read at a glance, so waves never
recolour it, only the environment drifts. The colour-safe palette widens the
split onto the blue-yellow axis, the one deuteranopia and protanopia leave
intact, and the types are distinguished by shape as well as hue.

![Colour-safe palette](docs/colour-safe.png)

## Architecture

```
index.html          canvas + letterbox shell
serve.js            zero-dependency static server
test/run.mjs        browser-driven test suite
src/
  main.js           game loop, waves, hit resolution, impact pipeline
  audio.js          synthesized adaptive score + beat-quantized SFX
  problems.js       adaptive fact table, weighted spawning, distractors
  theme.js          palette, colour-safe and reduced-motion state
  quality.js        frame-time-driven effect tiers
  util.js           math/easing helpers, the magnitude -> power curve
  entities/
    beasts/         base + mult, split, fraction, voidling, boss
    shield.js       dome, plates, aurora, planet, city lights, scars
    projectile.js   answer bolt and turret
  fx/               camera (shake, hitstop, slow-mo), particles,
                    shockwaves, orbs
  render/           post-processing chain, parallax starfield
  ui/               HUD, choice layout, overlays
```

Canvas2D at a fixed 1280×720, letterboxed by CSS. A few decisions worth knowing:

- **No intermediate scene buffer.** An unconditional full-resolution copy cost
  ~15ms/frame on a software rasteriser, so post effects run in place.
- **Chromatic aberration rides the quarter-res bloom buffer**, so a frame pays
  for exactly one full-res composite whether or not it is active.
- **The nebula and its blurred copy are baked** into caches refreshed five times
  a second. Re-blurring a full-resolution backdrop every frame for the
  depth-of-field cost 16ms on its own.
- **The backdrop draws outside the camera transform**, because it is exactly
  screen-sized and zoom or shake would expose bare canvas at the edges.
- **Lattice cells are bucketed by brightness** and filled as four paths rather
  than one fill per cell — six 9×9 beasts was the largest single draw cost.
- **Quality adapts** to measured frame intervals with hysteresis.

### Performance

Measured under a software rasteriser with no GPU, so treat these as a pessimistic
floor rather than what real hardware sees — the full-resolution composites that
dominate the high tier are close to free on an accelerated canvas.

| | high | medium | low |
| --- | --- | --- | --- |
| Typical play | 21.8ms | 20.1ms | 8.4ms |
| Worst case (8 beasts, 45 orbs, 20 rings, slow-mo) | 42.6ms | 28.5ms | 17.3ms |

I have no way to verify GPU frame times from this environment. The adaptive
quality manager and the `?q=` override are the mitigation.

## Testing

`npm test` drives the real game in headless Chromium and asserts on live state —
44 checks covering the impact pipeline, magnitude scaling, every beast type,
overcharge, landings, the adaptive music, both accessibility modes, both input
modes, game over and restart, plus an end-to-end run to wave 7.

Two of them exist because of real failures the logic tests could not see:

- Boulders originally rendered a bare `48` with no question anywhere near them,
  and the only instruction was HUD text shown for the targeted beast alone. The
  suite now asserts that no beast renders its prompt as just a number.
- Batching lattice cells into four fills for performance used a `roundRect`
  helper that called `beginPath()`, so each cell discarded the previous one and
  only four cells per beast were ever drawn. The suite now samples the canvas
  and counts lit cells, which is the only way to catch a rendering bug of that
  shape.
