// The planet and its hexagonal shield dome.
//
// The dome is the score. Every correct answer welds one more plate onto the arc,
// so accumulated competence is a physical structure you can see -- and it pays
// off mechanically: an intact plate absorbs a landing that would otherwise cost
// a core. Wrong answers crack plates. Landings leave permanent scars.

import { TAU, clamp, rand, lerp, easeOutElastic } from '../util.js';

// Geometry chosen so the arc apex sits at y=570 and both ends reach y=700 at the
// screen edges -- the whole dome stays visible inside the 1280x720 frame.
export const CX = 640;
export const CY = 1675;
export const R_SURFACE = 1045;
export const R_DOME = 1105;
const ARC_FROM = -118 * Math.PI / 180;
const ARC_TO = -62 * Math.PI / 180;
const PLATE_R = 17;

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
        integrity: 0,      // 0 = absent, 1 = whole
        pop: 0,            // placement animation timer
        crack: 0,          // recent-damage flash
      });
    }
    this.scars = [];
    this.t = 0;
    this.flash = 0;
  }

  // Height of the dome directly above a given x. Infinity outside the arc.
  domeY(x) {
    const dx = x - CX;
    if (Math.abs(dx) >= R_DOME) return Infinity;
    return CY - Math.sqrt(R_DOME * R_DOME - dx * dx);
  }

  nearestPlate(x, y = this.domeY(x)) {
    let best = null, bd = Infinity;
    for (const p of this.plates) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // Grow the dome outward from wherever the player is actually defending.
  addPlate(nearX) {
    let best = null, bd = Infinity;
    for (const p of this.plates) {
      if (p.integrity >= 1) continue;
      const d = Math.abs(p.x - nearX) + (p.integrity > 0 ? 0 : 40);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return null;
    best.integrity = clamp(best.integrity + 1, 0, 1);
    best.pop = 1;
    return best;
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

  // Does the dome hold at this x? If so, consume the plates that took the hit.
  absorb(x) {
    const hits = this.plates.filter((p) => Math.abs(p.x - x) < 46 && p.integrity > 0);
    if (hits.length === 0) return false;
    for (const p of hits) { p.integrity = 0; p.crack = 1; }
    this.flash = 1;
    return true;
  }

  // Angle of the point on the planet's surface directly below a given x.
  surfaceAngle(x) {
    const dx = clamp(x - CX, -R_SURFACE + 1, R_SURFACE - 1);
    return Math.atan2(-Math.sqrt(R_SURFACE * R_SURFACE - dx * dx), dx);
  }

  // A beast that got through. Permanent mark on the surface.
  scar(x) {
    const a = this.surfaceAngle(x);
    this.scars.push({ angle: a, r: rand(46, 26), t: 0 });
    for (const p of this.plates) {
      if (Math.abs(p.x - x) < 70) { p.integrity = 0; p.crack = 1; }
    }
  }

  get intact() { return this.plates.reduce((s, p) => s + p.integrity, 0); }
  get coverage() { return this.intact / this.count; }

  update(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    for (const p of this.plates) {
      if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 2.6);
      if (p.crack > 0) p.crack = Math.max(0, p.crack - dt * 1.8);
    }
    for (const s of this.scars) s.t += dt;
  }

  draw(ctx) {
    this._drawPlanet(ctx);
    this._drawArc(ctx);
    for (const p of this.plates) this._drawPlate(ctx, p);
  }

  _drawPlanet(ctx) {
    ctx.save();
    const g = ctx.createRadialGradient(CX - 200, CY - R_SURFACE - 40, 40, CX, CY, R_SURFACE * 1.05);
    g.addColorStop(0, '#2a4a7a');
    g.addColorStop(0.35, '#16294a');
    g.addColorStop(1, '#070b18');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(CX, CY, R_SURFACE, 0, TAU);
    ctx.fill();

    // Atmospheric rim light along the horizon.
    ctx.globalCompositeOperation = 'lighter';
    const rim = ctx.createRadialGradient(CX, CY, R_SURFACE - 26, CX, CY, R_SURFACE + 18);
    rim.addColorStop(0, 'hsla(200, 100%, 60%, 0)');
    rim.addColorStop(0.7, 'hsla(196, 100%, 62%, 0.28)');
    rim.addColorStop(1, 'hsla(196, 100%, 70%, 0)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(CX, CY, R_SURFACE + 20, 0, TAU);
    ctx.fill();
    ctx.restore();

    for (const s of this.scars) this._drawScar(ctx, s);
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
    // Cooling embers: bright right after impact, dull forever after.
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

  // The energy curtain between plates -- opacity follows local integrity, so a
  // battered section of dome visibly thins out.
  _drawArc(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 3;
    for (let i = 0; i < this.plates.length - 1; i++) {
      const p = this.plates[i], q = this.plates[i + 1];
      const strength = Math.min(p.integrity, q.integrity);
      if (strength <= 0) continue;
      const pulse = 0.55 + Math.sin(this.t * 2.6 + i * 0.4) * 0.2 + this.flash * 0.5;
      ctx.strokeStyle = `hsla(188, 100%, 66%, ${strength * pulse * 0.6})`;
      ctx.beginPath();
      ctx.arc(CX, CY, R_DOME, p.angle, q.angle);
      ctx.stroke();
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
    const hue = hurt > 0 ? lerp(188, 8, hurt) : 188;
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
    ctx.strokeStyle = `hsla(${hue}, 100%, ${62 + pop * 20}%, ${0.55 * a + hurt * 0.6 + (1 - p.pop) * 0})`;
    ctx.stroke();

    // Half-integrity plates read as fractured, not merely dim.
    if (!full && p.integrity > 0) {
      ctx.beginPath();
      ctx.moveTo(-PLATE_R * 0.7, -PLATE_R * 0.3);
      ctx.lineTo(PLATE_R * 0.2, PLATE_R * 0.5);
      ctx.strokeStyle = `hsla(6, 100%, 66%, 0.75)`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Placement sparks, called by the game so particles stay in one system.
  sparkle(particles, p) {
    particles.burst(p.x, p.y, 16, { hue: 188, speed: 150, life: 0.5, size: 3 });
  }
}
