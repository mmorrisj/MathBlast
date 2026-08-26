// The planet and its hexagonal shield dome.
//
// The dome is the score. Orbs released by solved problems fly into it and each
// deposits a share of a plate, so accumulated competence is a physical thing you
// watch being built -- and it pays off mechanically, because an intact plate
// absorbs a landing that would otherwise cost a core.
//
// The planet carries the other half of the story: city lights along the limb,
// which go dark a cluster at a time as cores are lost, and permanent scars where
// beasts got through. They also answer the dome directly -- coverage decides how
// many of them dare be lit at all, and aurora stands over the limb in proportion
// -- so the reward for a clean wave is a world visibly coming back on rather
// than a percentage in the corner.

import { TAU, clamp, rand, lerp, damp, easeOutElastic, easeOutCubic } from '../util.js';
import { theme } from '../theme.js';

// Geometry chosen so the arc apex sits at y=570 and both ends reach y=700 at the
// screen edges -- the whole dome stays visible inside the 1280x720 frame.
export const CX = 640;
export const CY = 1675;
export const R_SURFACE = 1045;
export const R_DOME = 1105;
const ARC_FROM = -118 * Math.PI / 180;
const ARC_TO = -62 * Math.PI / 180;
const PLATE_R = 17;
const ARC_MID = (ARC_FROM + ARC_TO) / 2;
const ARC_HALF = (ARC_TO - ARC_FROM) / 2;
// The finishing shot is drawn out of the dome. The surge runs the arc from
// both ends and reaches the turret at the apex here, leaving the rest of the
// charge window for the beam itself.
export const SURGE_LAND = 0.72;
const LAND = SURGE_LAND;

// The planet answers the dome. Coverage 0..1 is read as "how much of the world
// dares turn its lights back on": cities kindle one at a time across that band,
// each stuttering like a cold tube before it holds, and above them aurora
// curtains thicken. It is the same number the HUD prints, spent on the one
// thing the player is defending rather than on another gauge.
const WAKE_LO = 0.04;         // coverage at which the first city relights
const WAKE_HI = 0.86;         // coverage at which the last one does
const SETTLE = 0.13;          // coverage travelled while a city is still guttering
const KINDLE_R = 190;         // how far along the limb an absorbed orb is felt
const CURTAINS = 6;           // aurora ribbons at full coverage

// A perfect wave. The news travels out along the limb from the plate that was
// repaired, lighting each city as it arrives, and the whole world stays up
// celebrating for a few seconds afterwards. A flat flash would say the same
// thing in one frame and say it about nowhere in particular.
const NEWS = 0.9;             // radians per second the word spreads
const OVATION = 2.8;          // seconds the celebration takes to die down

// Street lights. Holding the dome whole is a state the game had no way of
// showing: coverage caps at 1 and every further orb cashed out as score. So the
// world starts building. Roads reach between the lit cities, spreading outward
// from the apex, and they unwind again if the dome is breached -- the network is
// a record of how long the planet has been safe, not another thing that only
// ever goes up.
const GRID_FULL = 0.995;      // coverage that counts as a whole dome
const GRID_TIME = 26;         // seconds of whole dome for the last road to start
const GRID_GROW = 1.8;        // seconds one road takes to reach across
const GRID_UNWIND = 0.55;     // how fast the clock runs back once it is breached

export class Shield {
  constructor() {
    const arc = ARC_TO - ARC_FROM;
    this.count = Math.round((arc * R_DOME) / 34);
    this.plates = [];
    for (let i = 0; i < this.count; i++) {
      const a = ARC_FROM + (arc * (i + 0.5)) / this.count;
      this.plates.push({
        angle: a,
        x: CX + Math.cos(a) * R_DOME,
        y: CY + Math.sin(a) * R_DOME,
        integrity: 0,
        pop: 0,
        crack: 0,
        glow: 0,
      });
    }
    this.scars = [];
    this.auroras = [];      // ripples travelling along the arc
    this.t = 0;
    this.flash = 0;

    // City lights: three groups so each lost core visibly darkens a third of
    // the inhabited limb.
    this.cities = [];
    for (let g = 0; g < 3; g++) {
      for (let i = 0; i < 16; i++) {
        const a = lerp(ARC_FROM - 0.12, ARC_TO + 0.12, (g * 16 + i + rand(0.8, 0.2)) / 48);
        // How much room there is to sit inland rather than on the limb. The
        // apex shows about seventy pixels of surface and the ends show none, so
        // cities in the middle spread back and the road network between them
        // has junctions instead of being one long chain.
        const room = Math.max(0, Math.cos(((a - ARC_MID) / ARC_HALF) * 1.25));
        this.cities.push({
          group: g,
          angle: a,
          depth: 1 - rand(0.028, 0) * room,
          tw: rand(TAU),
          size: rand(2.2, 0.9),
          wake: 0,
          flare: 0,
        });
      }
    }
    // Spread the relight thresholds evenly over the coverage band, then hand
    // them out in a shuffled order: an ordered walk would light the limb like a
    // progress bar wiping left to right, which is the one shape this must not
    // be. Scattered, it reads as a world waking up.
    const order = this.cities.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((c, i) => {
      this.cities[c].wake = lerp(WAKE_LO, WAKE_HI, (i + rand(0.85, 0.15)) / order.length);
    });
    this.darkGroups = 0;

    // Coverage, but smoothed: plates land in steps and the planet should not.
    this.lit = 0;
    // Bumped every time energy actually reaches the dome, so absorbing an orb
    // runs a swell through the atmosphere instead of only ticking a number.
    this.pulse = 0;
    // A perfect wave: 0..1 celebration level, and the front carrying the news.
    this.cheer = 0;
    this.news = null;

    // Seconds the dome has been whole. Roads between the cities grow out of it.
    this.uptime = 0;
    this.links = this._grid();

    // 0..1 while the Kraken's finisher winds up: two fronts running inward
    // along the arc, gathering what the player built into the cannon.
    this.surge = 0;
  }

  // The road network, laid out once. Neighbours are joined into a chain along
  // the limb and every third city reaches two along, which turns a line into
  // something with junctions in it.
  //
  // Roads arrive outward from the apex rather than in a scatter: the ground
  // directly under the strongest part of the dome is where anyone would build
  // first, and spreading from the middle in both directions is an expansion
  // rather than the left-to-right wipe the city lights themselves had to avoid.
  _grid() {
    const by = this.cities.map((c, i) => i).sort((a, b) => this.cities[a].angle - this.cities[b].angle);
    const pairs = [];
    for (let i = 0; i < by.length - 1; i++) {
      pairs.push([by[i], by[i + 1]]);
      if (i % 3 === 0 && i + 2 < by.length) pairs.push([by[i], by[i + 2]]);
    }
    const far = Math.max(...this.cities.map((c) => Math.abs(c.angle - ARC_MID)));
    return pairs.map(([a, b]) => {
      const mid = (this.cities[a].angle + this.cities[b].angle) / 2;
      const out = Math.abs(mid - ARC_MID) / (far || 1);
      return { a, b, born: GRID_TIME * out ** 0.85 * rand(1.1, 0.9), tw: rand(TAU) };
    });
  }

  domeY(x) {
    const dx = x - CX;
    if (Math.abs(dx) >= R_DOME) return Infinity;
    return CY - Math.sqrt(R_DOME * R_DOME - dx * dx);
  }

  // Point on the dome nearest a given x -- the target orbs fly to.
  domePoint(x) {
    const cx = clamp(x, CX - R_DOME + 40, CX + R_DOME - 40);
    return { x: cx, y: this.domeY(cx) };
  }

  surfaceAngle(x) {
    const dx = clamp(x - CX, -R_SURFACE + 1, R_SURFACE - 1);
    return Math.atan2(-Math.sqrt(R_SURFACE * R_SURFACE - dx * dx), dx);
  }

  // Deposit energy from an absorbed orb. Tops up the nearest incomplete plate,
  // spilling into neighbours if there is more than one plate's worth.
  deposit(x, amount) {
    const touched = [];
    let left = amount;
    let guard = 0;
    while (left > 0.001 && guard++ < 6) {
      let best = null, bd = Infinity;
      for (const p of this.plates) {
        if (p.integrity >= 1) continue;
        const d = Math.abs(p.x - x) + (p.integrity > 0 ? 0 : 40);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) break;
      const room = 1 - best.integrity;
      const give = Math.min(room, left);
      best.integrity += give;
      left -= give;
      if (best.pop <= 0) best.pop = 1;
      best.glow = 1;
      touched.push(best);
      this.auroras.push({ angle: best.angle, t: 0, life: 0.9 });
    }
    // Whether or not a plate had room for it, the energy arrived: a finished
    // dome is the most-defended the world ever is, and it should not be the one
    // state where nothing below it reacts.
    this.kindle(x, 0.55);
    return touched;
  }

  // Light reaching the ground under `x`. The cities beneath a repaired stretch
  // of dome flare, and the whole atmosphere swells a little.
  kindle(x, strength = 1) {
    this.pulse = Math.min(1.35, this.pulse + 0.3 * strength);
    for (const c of this.cities) {
      if (c.group < this.darkGroups) continue;
      const cx = CX + Math.cos(c.angle) * R_SURFACE;
      const near = 1 - clamp(Math.abs(cx - x) / KINDLE_R, 0, 1);
      if (near > 0) c.flare = Math.min(1, c.flare + near * strength);
    }
  }

  // A perfect wave. Every city cheers, but not at once: the word starts at `x`
  // and runs both ways along the limb, so what the player sees is a wave of
  // light crossing the world rather than the world blinking.
  ovation(x) {
    this.cheer = 1;
    this.news = { angle: this.surfaceAngle(x), t: 0 };
    for (const c of this.cities) c.cheered = false;
  }

  crackPlate(nearX) {
    let best = null, bd = Infinity;
    for (const p of this.plates) {
      if (p.integrity <= 0) continue;
      const d = Math.abs(p.x - nearX);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return null;
    best.integrity = Math.max(0, best.integrity - 0.5);
    best.crack = 1;
    return best;
  }

  // Repair the worst damaged plate -- the perfect-wave reward.
  // A perfect wave lifts one landing scar off the surface, so the planet is a
  // record of the run that clean play can undo rather than a one-way tally.
  healScar() {
    if (!this.scars.length) return null;
    return this.scars.shift();
  }

  repairWorst() {
    let best = null, bd = 2;
    for (const p of this.plates) {
      if (p.integrity > 0 && p.integrity < 1 && p.integrity < bd) { bd = p.integrity; best = p; }
    }
    if (!best) return null;
    best.integrity = 1;
    best.pop = 1;
    best.glow = 1;
    this.auroras.push({ angle: best.angle, t: 0, life: 1.2 });
    this.kindle(best.x, 1);
    return best;
  }

  // Does the dome hold here? If so, consume the plates that took the hit.
  absorb(x) {
    const hits = this.plates.filter((p) => Math.abs(p.x - x) < 46 && p.integrity > 0);
    if (hits.length === 0) return false;
    for (const p of hits) { p.integrity = 0; p.crack = 1; }
    this.flash = 1;
    this.auroras.push({ angle: this.surfaceAngle(x), t: 0, life: 1.1 });
    return true;
  }

  scar(x) {
    this.scars.push({ angle: this.surfaceAngle(x), r: rand(46, 26), t: 0 });
    for (const p of this.plates) {
      if (Math.abs(p.x - x) < 70) { p.integrity = 0; p.crack = 1; }
    }
  }

  loseCore() { this.darkGroups = Math.min(3, this.darkGroups + 1); }

  get intact() { return this.plates.reduce((s, p) => s + p.integrity, 0); }
  get coverage() { return this.intact / this.count; }

  // How much of the world has its lights on, and how many aurora ribbons stand
  // over it. Both are read by the draw, and both are the honest answer to "is
  // the planet actually responding to the dome" without sampling pixels.
  get awake() { return this.cities.filter((c) => this.woke(c) > 0).length; }

  // 0 dark, 1 burning steady, in between still guttering on.
  woke(c, lit = this.lit) {
    if (c.group < this.darkGroups) return 0;
    return clamp((lit - c.wake) / SETTLE, 0, 1);
  }

  get curtains() { return Math.round(clamp(this.lit, 0, 1) * CURTAINS); }

  // How far a road has got: 0 not started, 1 all the way across. A road between
  // cities that are not both lit does not exist -- street lights need a street
  // with somebody on it at either end.
  reach(l) {
    if (this.woke(this.cities[l.a]) <= 0 || this.woke(this.cities[l.b]) <= 0) return 0;
    return clamp((this.uptime - l.born) / GRID_GROW, 0, 1);
  }

  get roads() { return this.links.filter((l) => this.reach(l) > 0).length; }

  // Drive the surge from outside -- main owns the charge ramp. Plates flare as
  // the front crosses them, so the shot is visibly made of the dome and a
  // half-built dome sends a thinner one.
  surgeTo(c) {
    const was = this.surge;
    this.surge = c;
    if (c <= 0 || c >= 1) return;
    const front = ARC_HALF * (1 - clamp(c / LAND, 0, 1));
    const prev = ARC_HALF * (1 - clamp(was / LAND, 0, 1));
    if (front >= prev) return;
    for (const p of this.plates) {
      if (p.integrity <= 0) continue;
      const off = Math.abs(p.angle - ARC_MID);
      if (off <= prev && off > front) p.glow = 1;
    }
  }

  update(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    // Chase coverage rather than snapping to it, so a plate completing reads as
    // the planet drawing breath. Losing the dome falls faster than building it
    // rises -- the lights going out should be the more alarming half.
    const cov = this.coverage;
    this.lit = damp(this.lit, cov, cov < this.lit ? 3.4 : 1.5, dt);
    // The uptime clock. It runs forward only while the dome is whole and runs
    // back more slowly than it ran forward, so one absorbed hit costs you some
    // of the network rather than all of it.
    this.uptime = cov >= GRID_FULL
      ? Math.min(GRID_TIME + GRID_GROW, this.uptime + dt)
      : Math.max(0, this.uptime - dt * GRID_UNWIND);
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    this.cheer = Math.max(0, this.cheer - dt / OVATION);
    if (this.news) {
      this.news.t += dt;
      const reach = this.news.t * NEWS;
      let waiting = false;
      for (const c of this.cities) {
        if (c.cheered) continue;
        if (Math.abs(c.angle - this.news.angle) <= reach) {
          // A city that has never been lit does not get to cheer; it is still
          // dark, and pretending otherwise would undo the one thing coverage
          // is saying.
          if (this.woke(c) > 0) c.flare = 1;
          c.cheered = true;
        } else {
          waiting = true;
        }
      }
      if (!waiting) this.news = null;
    }
    for (const c of this.cities) {
      if (c.flare > 0) c.flare = Math.max(0, c.flare - dt * 1.25);
    }
    for (const p of this.plates) {
      if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 2.6);
      if (p.crack > 0) p.crack = Math.max(0, p.crack - dt * 1.8);
      if (p.glow > 0) p.glow = Math.max(0, p.glow - dt * 1.4);
    }
    for (const s of this.scars) s.t += dt;
    for (let i = 0; i < this.auroras.length; i++) {
      this.auroras[i].t += dt;
      if (this.auroras[i].t >= this.auroras[i].life) {
        this.auroras.splice(i--, 1);
      }
    }
  }

  // `density` is the quality tier's effects scale -- the aurora is the first
  // thing a slow machine should lose, and the last thing it needs.
  draw(ctx, density = 1) {
    this._drawPlanet(ctx, density);
    this._drawArc(ctx);
    this._drawAurora(ctx);
    for (const p of this.plates) this._drawPlate(ctx, p);
    if (this.surge > 0) this._drawSurge(ctx);
  }

  // Two heads travelling the arc inward with a trailing wake behind them, and
  // a pool of light building at the apex as they arrive.
  _drawSurge(ctx) {
    const c = clamp(this.surge, 0, 1);
    const run = clamp(c / LAND, 0, 1);
    // A dome the player never finished has less to give.
    let built = 0;
    for (const p of this.plates) built += p.integrity;
    const power = 0.45 + 0.55 * (built / this.plates.length);
    const front = ARC_HALF * (1 - run);
    const tail = 0.16 + run * 0.1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const dir of [-1, 1]) {
      const head = ARC_MID + dir * front;
      const back = ARC_MID + dir * Math.min(ARC_HALF, front + tail);
      const lo = Math.min(head, back), hi = Math.max(head, back);
      for (let band = 0; band < 3; band++) {
        ctx.strokeStyle = `hsla(${theme.friendly + band * 14}, 100%, ${72 + band * 10}%, ${power * (0.5 - band * 0.13)})`;
        ctx.lineWidth = (13 - band * 4) * (0.75 + run * 0.6);
        ctx.beginPath();
        ctx.arc(CX, CY, R_DOME + band * 5 - 3, lo, hi);
        ctx.stroke();
      }
      // The head itself, a hot point riding the arc.
      const hx = CX + Math.cos(head) * R_DOME;
      const hy = CY + Math.sin(head) * R_DOME;
      const hr = (16 + run * 20) * power;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      g.addColorStop(0, `rgba(255,255,255,${0.75 * power})`);
      g.addColorStop(1, `hsla(${theme.friendly}, 100%, 60%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, TAU);
      ctx.fill();
    }

    // What has arrived, pooling under the turret.
    if (run > 0.25) {
      const pool = ((run - 0.25) / 0.75) ** 2 * power;
      const ax = CX + Math.cos(ARC_MID) * R_DOME;
      const ay = CY + Math.sin(ARC_MID) * R_DOME;
      const pr = 20 + pool * 70;
      const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, pr);
      g.addColorStop(0, `rgba(255,255,255,${0.6 * pool})`);
      g.addColorStop(0.4, `hsla(${theme.friendly + 12}, 100%, 70%, ${0.35 * pool})`);
      g.addColorStop(1, `hsla(${theme.friendly}, 100%, 60%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ax, ay, pr, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawPlanet(ctx, density = 1) {
    // Two numbers, and keeping them apart matters. `lit` is what the player has
    // actually built, and it alone decides which cities are awake. `glow` is
    // what the sky looks like this instant -- the swell of an absorbed orb and
    // the ovation of a perfect wave ride on top of it, and it is allowed past 1.
    // Running the pair together would have a celebration switch on cities that
    // the dome has not earned yet, then switch them off again as it faded.
    const lit = clamp(this.lit, 0, 1);
    const glow = clamp(lit + this.pulse * 0.22 + this.cheer * 0.2, 0, 1.15);
    const calm = theme.reducedMotion ? 0.22 : 1;

    ctx.save();
    if (!this._body) {
      const g = ctx.createRadialGradient(CX - 200, CY - R_SURFACE - 40, 40, CX, CY, R_SURFACE * 1.05);
      g.addColorStop(0, '#2a4a7a');
      g.addColorStop(0.35, '#16294a');
      g.addColorStop(1, '#070b18');
      this._body = g;
    }
    ctx.fillStyle = this._body;
    ctx.beginPath();
    ctx.arc(CX, CY, R_SURFACE, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    // The atmosphere thickens as the dome does: brighter, and reaching further
    // off the limb, so the planet has a halo worth protecting by the end.
    const reach = 18 + glow * 26;
    const rim = ctx.createRadialGradient(CX, CY, R_SURFACE - 26, CX, CY, R_SURFACE + reach);
    rim.addColorStop(0, `hsla(${theme.friendly + 10}, 100%, 60%, 0)`);
    rim.addColorStop(0.7, `hsla(${theme.friendly + 6}, 100%, ${62 + glow * 8}%, ${0.28 + glow * 0.22})`);
    rim.addColorStop(1, `hsla(${theme.friendly + 6}, 100%, 70%, 0)`);
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(CX, CY, R_SURFACE + reach + 2, 0, TAU);
    ctx.fill();

    this._drawCurtains(ctx, glow, density, calm);
    this._drawRoads(ctx, glow, calm);

    // City lights. A darkened group leaves a cold ember behind, not nothing --
    // the lights went out, the city is still there. An unwoken one is the same
    // ember for the opposite reason: nobody has dared switch it on yet.
    for (const c of this.cities) {
      const r = R_SURFACE * c.depth;
      const x = CX + Math.cos(c.angle) * r;
      const y = CY + Math.sin(c.angle) * r;
      // 0 asleep, 1 burning steady. In between it is coming on.
      const woke = this.woke(c);
      if (woke <= 0) {
        // Two ways to be dark, and they should not look alike: a city whose
        // core was lost is a burnt ember, a city that has not dared switch on
        // yet is cold. Same dimness, opposite stories.
        const lost = c.group < this.darkGroups;
        const dim = 0.1 + (0.6 + Math.sin(this.t * 1.8 * calm + c.tw) * 0.4) * 0.06;
        ctx.fillStyle = lost ? `hsla(18, 60%, 40%, ${dim})` : `hsla(214, 24%, 52%, ${dim * 0.75})`;
        ctx.beginPath();
        ctx.arc(x, y, c.size * 0.7, 0, TAU);
        ctx.fill();
        continue;
      }

      // Three twinkles now: the slow breath every light has always had, a
      // faster shimmer that only shows up on a well-defended world, and -- for
      // a few seconds after a perfect wave -- an outright sparkle, each city
      // running at its own rate so the limb glitters rather than pulses.
      const tw = 0.6 + Math.sin(this.t * 1.8 * calm + c.tw) * 0.4
        + Math.sin(this.t * 4.3 * calm + c.tw * 2.1) * 0.16 * glow
        + Math.sin(this.t * (9 + c.tw * 2.4) * calm + c.tw * 3.7) * 0.38 * this.cheer;
      // The guttering. A tube that has just been switched on after a long dark
      // stutters before it holds, and the stutter dies out as the dome grows
      // past the threshold that woke it.
      const gutter = lerp(
        0.3 + 0.7 * (0.5 + 0.5 * Math.sin(this.t * (17 + c.tw * 8) * calm + c.tw * 5)) ** 3,
        1,
        woke,
      );
      const bright = clamp((0.4 + tw * 0.55) * gutter + c.flare * 0.7, 0, 1.4);
      // Sodium, and it stays sodium. An earlier pass lerped the hue toward the
      // dome's cyan as coverage rose and spent the whole middle of the run
      // passing through green, which reads as a fault, not as prosperity. The
      // cool light belongs above the cities, in the aurora, not in them.
      const hue = 46 + glow * 5;
      ctx.fillStyle = `hsla(${hue}, 100%, ${76 + glow * 10 + c.flare * 14}%, ${bright})`;
      ctx.beginPath();
      ctx.arc(x, y, c.size * (0.8 + woke * 0.3 + glow * 0.2 + c.flare * 0.6), 0, TAU);
      ctx.fill();

      // A halo on the brightest of them, from a cached sprite: forty-eight
      // gradients a frame is not worth it, and forty-eight flat discs read as
      // grey coins rather than as light.
      const halo = (bright - 0.55) * glow * density;
      if (halo > 0.02) {
        const hr = c.size * (5 + glow * 5 + c.flare * 7);
        ctx.globalAlpha = clamp(halo * 1.15, 0, 1);
        ctx.drawImage(this._glow(), x - hr, y - hr, hr * 2, hr * 2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();

    for (const s of this.scars) this._drawScar(ctx, s);
  }

  // The roads, drawn as sodium lines reaching out of one city toward the next.
  //
  // Fifty links twinkling independently would be fifty strokes a frame, twice
  // over. Instead each link's flicker is quantised into one of three brightness
  // steps and every link at a step goes into one path -- three strokes a pass,
  // and a link still crosses between steps at its own rate, so the grid
  // glitters rather than pulsing as one sheet.
  _drawRoads(ctx, glow, calm) {
    if (this.uptime <= 0) return;
    const STEPS = 3;
    const buckets = [[], [], []];
    for (const l of this.links) {
      const p = this.reach(l);
      if (p <= 0) continue;
      const a = this.cities[l.a], b = this.cities[l.b];
      const ax = CX + Math.cos(a.angle) * R_SURFACE * a.depth;
      const ay = CY + Math.sin(a.angle) * R_SURFACE * a.depth;
      const bx = CX + Math.cos(b.angle) * R_SURFACE * b.depth;
      const by = CY + Math.sin(b.angle) * R_SURFACE * b.depth;
      // Same flicker vocabulary as the lights it joins: a slow breath, and a
      // sparkle for the seconds after a perfect wave.
      const tw = 0.62 + Math.sin(this.t * 1.5 * calm + l.tw) * 0.24
        + Math.sin(this.t * (8 + l.tw) * calm + l.tw * 2) * 0.3 * this.cheer;
      const step = clamp(Math.floor(tw * STEPS), 0, STEPS - 1);
      buckets[step].push([ax, ay, lerp(ax, bx, p), lerp(ay, by, p)]);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass ? 3.4 : 1.1;
      for (let s = 0; s < STEPS; s++) {
        if (!buckets[s].length) continue;
        const bright = (0.45 + s * 0.28) * glow;
        ctx.strokeStyle = `hsla(${42 + s * 3}, 100%, ${62 + s * 8}%, ${bright * (pass ? 0.07 : 0.3)})`;
        ctx.beginPath();
        for (const [x0, y0, x1, y1] of buckets[s]) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // One soft warm dot, drawn once and reused for every city halo.
  _glow() {
    if (this._glowSprite) return this._glowSprite;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'hsla(48, 100%, 86%, 0.95)');
    grad.addColorStop(0.22, 'hsla(46, 100%, 72%, 0.5)');
    grad.addColorStop(0.5, 'hsla(42, 100%, 64%, 0.17)');
    grad.addColorStop(1, 'hsla(38, 100%, 58%, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this._glowSprite = c;
    return c;
  }

  // Aurora over the limb: ribbons standing off the surface, waving, one more of
  // them for every sixth of the dome rebuilt. They are drawn under the plates
  // and over the planet, which is where an aurora belongs -- between the world
  // and the thing shielding it.
  _drawCurtains(ctx, lit, density, calm) {
    const n = Math.round(this.curtains * density);
    if (n <= 0) return;
    const SAMPLES = 16;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      // Golden-angle phases so no two ribbons ever fall into step.
      const ph = i * 2.399;
      const slide = Math.sin(this.t * (0.11 + i * 0.017) * calm + ph);
      // Each ribbon owns a stretch of the limb and only wanders inside it.
      // Letting the drift place them outright piled them all at one end
      // whenever their phases happened to agree -- and under reduced motion,
      // where the drift barely moves, that pile was permanent.
      const home = ((i + 0.5) / n) * 2 - 1;
      const mid = ARC_MID + (home * 0.72 + slide * 0.26) * ARC_HALF;
      const half = 0.085 + 0.05 * Math.sin(this.t * 0.31 * calm + ph * 1.7);
      const tall = (62 + i * 17) * (0.5 + lit * 0.7);
      const shimmer = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * (1.3 + i * 0.37) * calm + ph * 3));
      const alpha = lit ** 1.5 * 0.28 * shimmer * (1 - i / (CURTAINS + 2));
      if (alpha < 0.004) continue;

      // Each ribbon starts a little bluer than the dome and the stack walks on
      // into violet, so the aurora is weather over the planet rather than a
      // second, blurrier shield drawn in the shield's own colour.
      const hue = theme.friendly + 16 + i * 12;
      // Two passes: the broad veil, then a brighter fold drifting along inside
      // it. One flat wedge reads as fog; the fold is what makes it a curtain.
      // Only the front ribbons earn the second pass -- behind those the fold is
      // under a tenth of an alpha and nobody can see it.
      for (let pass = 0; pass < (i < 3 ? 2 : 1); pass++) {
        const wide = pass ? half * 0.3 : half;
        const high = pass ? tall * 0.82 : tall;
        const at = pass ? mid + Math.sin(this.t * 0.53 * calm + ph * 2.3) * half * 0.5 : mid;
        const a2 = pass ? alpha * 1.35 : alpha;

        const g = ctx.createRadialGradient(CX, CY, R_SURFACE - 6, CX, CY, R_SURFACE + high);
        g.addColorStop(0, `hsla(${hue}, 100%, 70%, 0)`);
        g.addColorStop(0.3, `hsla(${hue}, 100%, ${pass ? 82 : 72}%, ${a2})`);
        g.addColorStop(0.62, `hsla(${hue + 16}, 100%, 66%, ${a2 * 0.55})`);
        g.addColorStop(1, `hsla(${hue + 24}, 100%, 62%, 0)`);
        ctx.fillStyle = g;

        ctx.beginPath();
        // Up the outer edge, which ripples along its length and tapers at both
        // ends, then back along the surface.
        for (let s = 0; s <= SAMPLES; s++) {
          const f = s / SAMPLES;
          const a = at + lerp(-wide, wide, f);
          const taper = Math.sin(f * Math.PI) ** 0.7;
          const wave = 0.6 + 0.4 * Math.sin(f * 9 + this.t * 1.1 * calm + ph * 2);
          const r = R_SURFACE + high * taper * wave;
          const px = CX + Math.cos(a) * r;
          const py = CY + Math.sin(a) * r;
          s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.arc(CX, CY, R_SURFACE - 6, at + wide, at - wide, true);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawScar(ctx, s) {
    const x = CX + Math.cos(s.angle) * R_SURFACE;
    const y = CY + Math.sin(s.angle) * R_SURFACE;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(s.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(6,4,10,0.92)';
    ctx.beginPath();
    ctx.ellipse(0, 6, s.r, s.r * 0.5, 0, 0, TAU);
    ctx.fill();
    const heat = Math.max(0.18, 1 - s.t / 6);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 4, 0, 0, 4, s.r);
    g.addColorStop(0, `hsla(24, 100%, 60%, ${0.55 * heat})`);
    g.addColorStop(1, 'hsla(20, 100%, 50%, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 4, s.r * 1.2, s.r * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  _drawArc(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 3;
    for (let i = 0; i < this.plates.length - 1; i++) {
      const p = this.plates[i], q = this.plates[i + 1];
      const strength = Math.min(p.integrity, q.integrity);
      if (strength <= 0) continue;
      const pulse = 0.55 + Math.sin(this.t * 2.6 + i * 0.4) * 0.2 + this.flash * 0.5;
      ctx.strokeStyle = `hsla(${theme.friendly}, 100%, 66%, ${strength * pulse * 0.6})`;
      ctx.beginPath();
      ctx.arc(CX, CY, R_DOME, p.angle, q.angle);
      ctx.stroke();
    }
    ctx.restore();
  }

  // A shimmer that runs outward along the arc from wherever energy landed.
  _drawAurora(ctx) {
    if (!this.auroras.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of this.auroras) {
      const p = a.t / a.life;
      const spread = easeOutCubic(p) * 0.42;
      const fade = (1 - p) ** 2;
      for (const dir of [-1, 1]) {
        const from = a.angle + dir * spread * 0.55;
        const to = a.angle + dir * spread;
        const lo = Math.min(from, to), hi = Math.max(from, to);
        for (let band = 0; band < 3; band++) {
          ctx.strokeStyle = `hsla(${theme.friendly + band * 16}, 100%, ${70 + band * 8}%, ${fade * (0.34 - band * 0.09)})`;
          ctx.lineWidth = 10 - band * 3;
          ctx.beginPath();
          ctx.arc(CX, CY, R_DOME + band * 7, lo, hi);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  _drawPlate(ctx, p) {
    if (p.integrity <= 0 && p.crack <= 0) return;
    const pop = p.pop > 0 ? easeOutElastic(1 - p.pop) : 1;
    const scale = lerp(0.2, 1, pop);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.scale(scale, scale);

    const hurt = p.crack;
    const full = p.integrity >= 1;
    const hue = hurt > 0 ? lerp(theme.friendly, theme.hostile, hurt) : theme.friendly;
    const a = clamp(p.integrity, 0, 1);

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU + Math.PI / 6;
      const px = Math.cos(ang) * PLATE_R;
      const py = Math.sin(ang) * PLATE_R;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();

    ctx.fillStyle = `hsla(${hue}, 85%, ${full ? 46 : 34}%, ${0.24 * a + hurt * 0.3})`;
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = full ? 2.2 : 1.4;
    ctx.strokeStyle = `hsla(${hue}, 100%, ${62 + p.glow * 30}%, ${0.55 * a + hurt * 0.6 + p.glow * 0.4})`;
    ctx.stroke();

    if (!full && p.integrity > 0) {
      ctx.beginPath();
      ctx.moveTo(-PLATE_R * 0.7, -PLATE_R * 0.3);
      ctx.lineTo(PLATE_R * 0.2, PLATE_R * 0.5);
      ctx.strokeStyle = `hsla(${theme.hostile}, 100%, 66%, 0.75)`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }
}
