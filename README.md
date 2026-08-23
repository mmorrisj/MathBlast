# MathBlast

A 90s-arcade math defence game rebuilt with modern graphics and audio. Beasts
descend toward your planet; the only way to stop one is to solve it.

![MathBlast in play](docs/screenshot.png)

## Difficulty

Three tiers, each a different curriculum rather than the same problems sped up.
Chosen on the title screen and remembered per player.

| | | |
| --- | --- | --- |
| **EASY** | Grade 3 | Addition and subtraction as base-ten blocks, single-digit times tables, a missing-addend boss. No negatives — grade 3 has not met them. |
| **MEDIUM** | Grades 4–6 | Times tables to twelve, factoring and primes, unit fractions, additive inverses, a one-step equation boss. |
| **HARD** | Grade 7 | Signed integer multiply and divide, fraction sums with unlike denominators, percentages, squares and roots, a two-step equation boss with negative solutions. |

![Easy tier](docs/tier-easy.png)

Easy draws addition and subtraction the way the material is taught: a rod is
ten, a square is one, and subtraction strikes out the part being taken away —
so a stuck player can count, exactly as they can count a `7 × 8` lattice.

![Hard tier](docs/tier-hard.png)

Hard reuses the same rule. Negatives are dark chips with a bright rim, borrowed
from the voidling, so the sign rules are learned by seeing which pairings make
which result. A percentage is the lit part of a ticked bar. `7²` is a square
asking for its area and `√81` is the same square asking for its side.

## The design rule

> The math should *be* the graphics, not decorate them.

A `7 × 8` beast is a countable 7-by-8 lattice, so multiplication looks like area.
A `48` asteroid struck with `6` fractures into two chunks physically sized `6`
and `8`. A prime glows red and refuses to split, so the only way to kill it is to
name it. Nobody is told what a prime is — the rock teaches it by being
unbreakable.

## Players and scores

First launch asks who is playing. A profile owns its own fact history, so two
people sharing a device get their own adaptive difficulty rather than averaging
into one blurred learner — and its own personal bests. The score table is global
across profiles, because a shared leaderboard is the point of having names.

Everything lives in `localStorage`; a run that beats a record says so on the
game-over screen, and the top five sit under the title.

The table holds **twenty** places. Twenty rows do not fit the gap the title
screen has for them, so they get their own screen — **T**, or the ★ button on a
phone — laid out as two columns of ten with the score, wave and difficulty each
run was set on, and the run you just finished picked out in gold. The game-over
screen already announced a placing (`#13 ON THE BOARD`) that the five-row
preview could not show, which is most of the reason a deeper table needs a
screen of its own.

![Choosing a player](docs/profiles.png)

## On a phone

Touch is detected from the pointer media query, which switches the game to the
pick-an-answer layout, enlarges the answer targets past the ~44px physical
minimum once 1280×720 is scaled to a phone, and puts a beam, pause and help
button in the bottom corners where thumbs already rest. Tap a beast to aim at
it. An upright phone gets a rotate prompt — a 16:9 playfield in portrait is too
small to read.

Name entry hands off to a real `<input>` laid over the canvas, so phones raise
the native keyboard instead of a letter grid nobody wants to thumb through.

![On a phone](docs/mobile.png)

## Running it

No build step and no dependencies.

```bash
npm start          # -> http://localhost:5173
npm test           # browser-driven suite (needs Playwright; skips cleanly without)
```

Any static server works. It must be served over HTTP rather than opened as a
`file://` URL, because the code uses ES modules.

![How to play](docs/how-to-play.png)

### Controls

| Key | Action |
| --- | --- |
| `0`–`9`, `/`, `x`, `-` | Type the answer (`/` for fractions like `3/4`; `x` types `×` for pairs like `6×8`; `-` for negative answers) |
| `←` `→` | Choose difficulty (on the title screen) |
| `Enter` | Fire &nbsp;·&nbsp; `Backspace` delete &nbsp;·&nbsp; `Esc` clear |
| `[` `]` or click | Choose which beast to solve; otherwise the turret auto-targets the most dangerous one |
| `Space` | Overcharge beam, once charged |
| `Tab` | Switch between typing and picking from four answers |
| `C` / `R` | Colour-safe palette / reduced motion |
| `ESC` | Switch player (from the title) |
| `H` | How to play — every control and beast in one screen, from the title or mid-game |
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
| **Fraction crystal** | Labelled `? / 8`, a shell with a wedge missing, faceted at every `1/q` so the denominator is countable. Takes the counted numerator (`3`) or any equivalent fraction (`3/8`, `6/16`). |
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

## Installing it as an app

The game is an installable PWA: a manifest that asks for fullscreen and
landscape, maskable icons, and a service worker that precaches all 38 files. It
boots and plays with the network off — the typeface ships in `assets/font/`
rather than coming off Google Fonts, which an installed app cannot reach on a
plane. `npm test` fails if the precache list drifts from what is on disk, so
adding a source file cannot silently break the offline build.

Installed, it also does the things a page has to do for itself that an app gets
from the OS: a wake lock so the screen does not dim mid-problem, an orientation
lock, safe-area padding so a notch does not sit over the canvas, and Android's
back button closing an overlay instead of the app.

Played in a browser tab rather than installed, the first tap asks for
fullscreen and then locks landscape — in that order, because
`screen.orientation.lock()` rejects unless the document is already fullscreen.
It keeps asking on later taps rather than giving up after one refusal, so
leaving fullscreen is recoverable, and stops after three consecutive refusals
from a browser that will not allow it. Where it is refused outright the canvas
sizes itself to `visualViewport` instead of `window.innerHeight`, so the
playfield sits beside the browser's bar rather than behind it.

No build step means any static host serves it straight from the repo root, and
every shipped URL is relative so a subpath host works too — GitHub Pages, then
**Add to Home screen** on the phone, gets you the installed app without
building anything. For an actual Play Store listing it wraps in Capacitor
(`npm run app:apk`). Both routes, and the parts that are paperwork rather than
code, are in [docs/ANDROID.md](docs/ANDROID.md).

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
- **Five stems fade in with proximity**, making the mix double as a threat meter:
  silence at the top of the screen, drums by the time something is about to land.
- **The arrangement escalates by sector.** Every three waves the track moves up
  a stage: a melodic hook enters and thickens (0 → 6 → 9 → 12 notes a bar), the
  bassline adds offbeat stabs, and a sidechain pump deepens from nothing to
  0.54. Tempo runs 100 → 136 BPM. Each wave arrives on a charge that is locked
  to a bar line and schedules its own arrival, so the interlude runs for exactly
  as long as the music needs rather than a fixed count that lands wherever it
  lands. The charge is the tonic chord swelling in under a pulse that
  accelerates into the bar line — pitched material only, peaking quieter than
  the loudest tenth of ordinary play, so it reads as energy gathering rather
  than a transition effect over the top of the score.
- **The kit plays phrases, not a loop.** Each sector has its own sixteen-step
  pattern written as velocity strings, running 8 → 15 → 27 → 33 onsets a bar as
  the kick syncopates and ghost snares fill the gaps. Every four bars close on a
  tom fill and the next opens on a crash, velocities wobble a few percent, and
  the hats drift by under a millisecond — a grid-locked hat line rings like one
  long tone rather than a series of hits. Only accented kicks drive the
  sidechain; a ghost kick pumping the mix sounds like a fault, not a groove.
  The drums also arrive earlier every sector (danger 0.62 → 0.11), so by
  CRIMSON DEEP the kit is simply always there.
- **Panned by screen position**, with a convolution reverb built from
  exponentially decaying noise, and a held breath — everything cuts, the tail
  carries — between waves.

Wrong answers never buzz. The beast lurches closer and the combo resets, but
there is no harsh error tone and the problem stays on screen. The punishment is
proximity, not a scolding.

## Sectors

Progress is banded rather than smeared — twelve degrees of hue a wave is
invisible while you are playing. Every three waves the sky changes sector, with
its own name, nebula strength and star tint, announced on the wave banner.

| Wave 1 — Blue Drift | Wave 10 — Crimson Deep |
| --- | --- |
| ![Sector 1](docs/sector-1.png) | ![Sector 4](docs/sector-10.png) |

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
81 checks covering the impact pipeline, magnitude scaling, every beast type,
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
- The name field carried `maxlength="12"`, which truncated the *raw* string
  before whitespace was collapsed, so "  Ada  Lovelace" became "Ada Lovel".
  `cleanName` is now the only place that caps length.
- The wave build used an exponential gain ramp — a factor of thousands, which
  stays inaudible until the last tenth and then jumps, landing as a zip rather
  than a rise. The suite now renders it in an `OfflineAudioContext` and asserts
  the envelope climbs and that the loudest moment is the drop.
- "The drum sounds dumb" turned out not to be a timbre problem. Measuring each
  voice through a filter bank in an `OfflineAudioContext` showed every band it
  needed — the kick's beater click peaks at 0.31 above 7 kHz, the snare spreads
  across 250 Hz to 9 kHz. What was wrong was the pattern: kick on 1 and 3, snare
  on 2 and 4, straight hats, byte-identical every bar for the entire game. That
  is a metronome. The fix was a pattern engine with per-sector kits, velocity,
  fills and phrase structure. (The first version of that filter bank measured
  every voice as a flat 0.16 across all six bands, which is the shape of a
  broken instrument: `start()` leaves its sequencer running, so a full track was
  playing underneath each "single voice" render. A control tone through the same
  bank is what caught it.)
- The kit was gated on `danger > 0.62` in every sector, so most of a run had no
  percussion at all. The suite now probes the real gate by recording what
  `setDanger` asks the drum layer for, rather than restating the formula.
- The wave transition was an EDM riser — noise sweeping to 4 kHz, an
  accelerating snare roll, a sawtooth climbing a fifth, a film-trailer sub drop.
  Rendered offline it peaked at RMS 0.35 against ordinary play's 0.12, so it was
  nearly three times louder than the loudest tenth of the game it interrupted.
  That is what "the sound aesthetic doesn't work" measures as. The charge that
  replaced it sits at 0.099. A loudness assertion needs something to compare
  against, so the suite now renders a reference bar of gameplay alongside it.

The suite also opens a second, touch-enabled context at phone dimensions and
drives the whole flow by tapping — profile creation, starting a run, answering,
the beam and help buttons — because none of that is reachable from the desktop
page.
