// The planet and its hexagonal shield dome.
//
// The dome is the score. Orbs released by solved problems fly into it and each
// deposits a share of a plate, so accumulated competence is a physical thing you
// watch being built -- and it pays off mechanically, because an intact plate
// absorbs a landing that would otherwise cost a core.
//
// The planet carries the other half of the story: city lights along the limb,
// which go dark a cluster at a time as cores are lost, and permanent scars where
// beasts got through.

import { TAU, clamp, rand, lerp, easeOutElastic, easeOutCubic } from '../util.js';
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
        this.cities.push({
          group: g,
          angle: a,
          depth: rand(1, 0.986),
          tw: rand(TAU),
          size: rand(2.2, 0.9),
        });
      }
    }
    this.darkGroups = 0;
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
    return touched;
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

  update(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2.4);
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

  draw(ctx) {
    this._drawPlanet(ctx);
    this._drawArc(ctx);
    this._drawAurora(ctx);
    for (const p of this.plates) this._drawPlate(ctx, p);
  }

  _drawPlanet(ctx) {
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
    const rim = ctx.createRadialGradient(CX, CY, R_SURFACE - 26, CX, CY, R_SURFACE + 18);
    rim.addColorStop(0, `hsla(${theme.friendly + 10}, 100%, 60%, 0)`);
    rim.addColorStop(0.7, `hsla(${theme.friendly + 6}, 100%, 62%, 0.28)`);
    rim.addColorStop(1, `hsla(${theme.friendly + 6}, 100%, 70%, 0)`);
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(CX, CY, R_SURFACE + 20, 0, TAU);
    ctx.fill();

    // City lights. A darkened group leaves a cold ember behind, not nothing --
    // the lights went out, the city is still there.
    for (const c of this.cities) {
      const dark = c.group < this.darkGroups;
      const r = R_SURFACE * c.depth;
      const x = CX + Math.cos(c.angle) * r;
      const y = CY + Math.sin(c.angle) * r;
      const tw = 0.6 + Math.sin(this.t * 1.8 + c.tw) * 0.4;
      ctx.fillStyle = dark
        ? `hsla(18, 60%, 40%, ${0.1 + tw * 0.06})`
        : `hsla(46, 100%, 78%, ${0.35 + tw * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, c.size * (dark ? 0.7 : 1), 0, TAU);
      ctx.fill();
    }
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
