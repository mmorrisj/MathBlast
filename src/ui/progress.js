// The progress page: what a parent wants to know.
//
// Deliberately not a score or a grade. This is one game's telemetry, not an
// assessment, and presenting it as a mark out of ten would be claiming more
// than the data supports. What it answers instead is: what has been covered,
// what is solid, what has not been touched at all, and are they still playing.
//
// Coverage and accuracy are separate columns on purpose. "Never seen" and
// "seen and struggling" need completely different responses from a parent, and
// a single blended number hides which one you are looking at.

import { clamp, roundRect } from '../util.js';
import { theme } from '../theme.js';
import { conceptName } from '../progress.js';
import { chartStats } from './starchart.js';
import { planLabel, pct } from '../adaptive.js';

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const ROW_H = 30;
const TOP = 200;          // clear of the headline tiles above
const LEFT = 64;
const NAME_W = 290;   // concept name plus the level it has reached
const BAR_X = LEFT + NAME_W + 12;
const BAR_W = 150;
const SEEN_X = BAR_X + BAR_W + 66;
const ACC_X = SEEN_X + 84;
const TIME_X = ACC_X + 96;
const LAST_X = TIME_X + 96;

// Enough attempts for the accuracy to mean anything. Below it the page says so
// rather than printing a confident percentage off three answers.
const ENOUGH = 12;

function ago(day, today) {
  if (!day) return '—';
  const a = new Date(`${day}T00:00:00`);
  const b = new Date(`${today}T00:00:00`);
  const d = Math.round((b - a) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'last week';
  return `${Math.floor(d / 7)} weeks ago`;
}

function bar(ctx, x, y, w, frac, hue, dim) {
  ctx.fillStyle = 'rgba(120,170,215,0.14)';
  roundRect(ctx, x, y - 4, w, 8, 4);
  ctx.fill();
  if (frac <= 0) return;
  ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${dim ? 0.4 : 0.9})`;
  roundRect(ctx, x, y - 4, Math.max(5, w * clamp(frac, 0, 1)), 8, 4);
  ctx.fill();
}

export function drawProgress(ctx, g, W, H, today) {
  const rows = g.progress.summary();
  const totals = g.progress.totals();
  const streak = g.progress.streak();
  const recent = g.progress.recent(30);
  const sky = chartStats(g.skill);
  const player = g.profiles.active;

  // Coverage is judged against the busiest concept, so the bars answer "how
  // much of their practice went here", not "how close to some invented target".
  const busiest = Math.max(1, ...rows.map((r) => r.seen));

  ctx.save();
  ctx.fillStyle = 'rgba(4,6,16,0.96)';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.font = `700 30px ${MONO}`;
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowColor = `hsla(${theme.friendly},100%,60%,0.8)`;
  ctx.shadowBlur = 22;
  ctx.fillText(player ? player.name : 'PROGRESS', LEFT, 58);
  ctx.shadowBlur = 0;
  ctx.font = `400 13px ${MONO}`;
  ctx.fillStyle = 'rgba(150,190,220,0.6)';
  ctx.fillText('progress report — everything here is stored on this device only', LEFT, 84);

  // On Dynamic, say exactly what the game is currently sending and why. This
  // is the page where "why did it get harder" gets answered.
  if (g.tier && g.tier.dynamic) {
    ctx.font = `700 11px ${MONO}`;
    ctx.fillStyle = 'rgba(255,214,140,0.85)';
    ctx.textAlign = 'right';
    ctx.fillText('DYNAMIC DIFFICULTY', W - LEFT, 58);
    ctx.font = `400 13px ${MONO}`;
    ctx.fillStyle = 'rgba(200,228,248,0.85)';
    ctx.fillText(planLabel(g.plan, 3), W - LEFT, 80);
    ctx.font = `400 11px ${MONO}`;
    ctx.fillStyle = 'rgba(150,190,220,0.55)';
    const locked = g.plan.filter((e) => e.locked).length;
    ctx.fillText(locked ? `${locked} concepts still locked behind their prerequisites`
                        : 'every concept is in rotation', W - LEFT, 98);
    ctx.textAlign = 'left';
  }

  // Headline numbers.
  const tiles = [
    [String(totals.seen), 'problems answered'],
    [`${Math.round(totals.accuracy * 100)}%`, 'answered correctly'],
    [String(totals.played), totals.played === 1 ? 'day played' : 'days played'],
    [String(streak), streak === 1 ? 'day streak' : 'day streak'],
    [`${sky.known}/${sky.total}`, 'times-table stars'],
  ];
  tiles.forEach(([big, label], i) => {
    const x = LEFT + i * 218;
    ctx.font = `700 30px ${MONO}`;
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(big, x, 124);
    ctx.font = `400 12px ${MONO}`;
    ctx.fillStyle = 'rgba(150,190,220,0.62)';
    ctx.fillText(label, x, 146);
  });

  // Column headings.
  ctx.font = `700 11px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,66%,0.7)`;
  ctx.fillText('CONCEPT', LEFT, TOP - 16);
  ctx.fillText('SHARE OF PRACTICE', BAR_X, TOP - 16);
  ctx.textAlign = 'right';
  ctx.fillText('ANSWERED', SEEN_X, TOP - 16);
  ctx.fillText('CORRECT', ACC_X, TOP - 16);
  ctx.fillText('AVG TIME', TIME_X, TOP - 16);
  ctx.fillText('LAST', LAST_X, TOP - 16);

  rows.forEach((r, i) => {
    const y = TOP + i * ROW_H;
    const untouched = r.seen === 0;
    const thin = r.seen > 0 && r.seen < ENOUGH;

    ctx.textAlign = 'left';
    ctx.font = `${untouched ? 400 : 600} 15px ${MONO}`;
    ctx.fillStyle = untouched ? 'rgba(150,190,220,0.42)' : 'rgba(215,238,255,0.95)';
    ctx.fillText(r.name, LEFT, y);
    if (r.levelName) {
      // Right-aligned into the gutter before the bar. Measuring the concept
      // name to offset from it does not work: the measurement would have to
      // happen under the row font, not the small one being set here.
      ctx.font = `400 11px ${MONO}`;
      ctx.fillStyle = 'rgba(150,190,220,0.5)';
      ctx.textAlign = 'right';
      ctx.fillText(r.levelName, BAR_X - 12, y + 1);
      ctx.textAlign = 'left';
    }

    bar(ctx, BAR_X, y, BAR_W, r.seen / busiest, theme.friendly, untouched);

    ctx.textAlign = 'right';
    ctx.font = `400 14px ${MONO}`;
    ctx.fillStyle = untouched ? 'rgba(150,190,220,0.38)' : 'rgba(200,228,248,0.85)';
    ctx.fillText(untouched ? 'not yet' : String(r.seen), SEEN_X, y);

    if (untouched) {
      ctx.fillStyle = 'rgba(150,190,220,0.3)';
      ctx.fillText('—', ACC_X, y);
      ctx.fillText('—', TIME_X, y);
      ctx.fillText('—', LAST_X, y);
    } else {
      const pct = Math.round(r.accuracy * 100);
      // Below a dozen attempts a percentage is noise dressed as a finding.
      ctx.fillStyle = thin ? 'rgba(150,190,220,0.5)'
        : pct >= 85 ? 'hsla(150,80%,62%,0.95)'
        : pct >= 65 ? 'rgba(230,240,250,0.9)'
        : 'hsla(12,90%,66%,0.95)';
      ctx.fillText(thin ? `${pct}%*` : `${pct}%`, ACC_X, y);
      ctx.fillStyle = 'rgba(200,228,248,0.8)';
      ctx.fillText(r.avgSeconds ? `${r.avgSeconds.toFixed(1)}s` : '—', TIME_X, y);
      ctx.fillStyle = 'rgba(150,190,220,0.62)';
      ctx.fillText(ago(r.last, today), LAST_X, y);
    }

    // Beasts that reached the dome unanswered: ran out of time rather than got
    // it wrong, which is a different conversation.
    if (r.landed > 0) {
      ctx.textAlign = 'left';
      ctx.font = `400 11px ${MONO}`;
      ctx.fillStyle = 'rgba(255,150,120,0.6)';
      ctx.fillText(`${r.landed} ran out of time`, LAST_X + 22, y);
    }
  });

  // Activity strip.
  const stripY = TOP + rows.length * ROW_H + 34;
  ctx.textAlign = 'left';
  ctx.font = `700 11px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,66%,0.7)`;
  ctx.fillText('LAST 30 DAYS', LEFT, stripY - 16);
  const cw = 15;
  const busiestDay = Math.max(1, ...recent.map((d) => d.seen));
  recent.forEach((d, i) => {
    const x = LEFT + i * cw;
    const k = d.seen / busiestDay;
    ctx.fillStyle = d.seen
      ? `hsla(${theme.friendly}, 90%, ${34 + k * 32}%, ${0.45 + k * 0.55})`
      : 'rgba(120,170,215,0.1)';
    roundRect(ctx, x, stripY - 6, cw - 3, 13, 3);
    ctx.fill();
  });

  // What to work on, in the parent's words rather than the game's.
  const weak = g.skill.weakest(4);
  const gaps = rows.filter((r) => r.seen === 0);
  ctx.font = `700 11px ${MONO}`;
  ctx.fillStyle = 'rgba(255,214,140,0.8)';
  ctx.fillText('WORTH A LOOK', LEFT + 520, stripY - 16);
  ctx.font = `400 13px ${MONO}`;
  ctx.fillStyle = 'rgba(200,228,248,0.85)';
  const notes = [];
  if (weak.length) {
    notes.push(`slowest facts: ${weak.map((f) => `${f.a}${f.op || '×'}${f.b}`).join(', ')}`);
  }
  if (gaps.length) {
    notes.push(`not met yet: ${gaps.slice(0, 3).map((r) => conceptName(r.id).toLowerCase()).join(', ')}`
      + (gaps.length > 3 ? ` and ${gaps.length - 3} more` : ''));
  }
  if (!notes.length) notes.push('everything on the list has been practised');
  notes.forEach((n, i) => ctx.fillText(n, LEFT + 520, stripY - 2 + i * 20));

  ctx.textAlign = 'center';
  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = 'rgba(150,190,220,0.45)';
  ctx.fillText(`* fewer than ${ENOUGH} answers — too few to read much into`, W / 2, H - 54);
  ctx.font = `600 14px ${MONO}`;
  ctx.fillStyle = `hsla(${theme.friendly},90%,72%,0.9)`;
  ctx.fillText(g.touch ? 'tap anywhere to go back' : 'G or ESC to go back', W / 2, H - 30);
  ctx.restore();
}
