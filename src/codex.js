// The Codex: every challenge in the game, previewable before you meet it.
//
// Two rules shaped this file.
//
// First, the entries render the *real* thing. Each one builds an actual beast
// or encounter and hands it to the page, which draws it with the same code the
// game uses. A reference page that describes a Prism in words while the game
// draws a crystal is two sources of truth, and the drawn one wins.
//
// Second, the worked solution explains the example actually on screen, not a
// canned one -- so rerolling gives a fresh problem *and* a fresh explanation.
// That is what makes this a thing you can sit and practise with rather than a
// help screen you read once. It is also why the explanations live here beside
// the generators rather than inside the beasts: a beast's job is to be
// answered, not to teach.
//
// The tricks are the reason anyone would open this. Where a genuine mental
// shortcut exists it is stated plainly; where one does not, the field is left
// empty rather than padded with advice nobody uses.

import { randInt, rand } from './util.js';
import { ArithBeast, makeArith } from './entities/beasts/arith.js';
import { MultBeast } from './entities/beasts/mult.js';
import { bossSteps } from './entities/beasts/boss.js';
import { DivBeast, makeDiv } from './entities/beasts/div.js';
import { SplitBeast } from './entities/beasts/split.js';
import { Voidling } from './entities/beasts/voidling.js';
import { FractionBeast } from './entities/beasts/fraction.js';
import { splitNumber, fractionPair } from './entities/beasts/index.js';
import { PowerBeast, makePower } from './entities/beasts/power.js';
import { PercentBeast, makePercent } from './entities/beasts/percent.js';
import { FracOpBeast, makeFracOp } from './entities/beasts/fracop.js';
import { IntegerBeast, makeInteger } from './entities/beasts/integer.js';
import {
  Bulwark, Twins, Remainder, Cipher, Nought,
  Kraken, Hydra, Balance, Prism, Echo, DemandBeast,
} from './entities/bosses/index.js';

// --- worked solutions ------------------------------------------------------

function addSteps(a, b) {
  // Making ten is the trick worth teaching, and it only applies when the sum
  // actually crosses ten from two single digits. Anywhere else it is noise.
  if (a < 10 && b < 10 && a + b > 10) {
    const need = 10 - a;
    return [
      `${a} needs ${need} more to reach 10.`,
      `Split the ${b} into ${need} and ${b - need}.`,
      `10 + ${b - need} = ${a + b}.`,
    ];
  }
  if (a >= 10 || b >= 10) {
    const at = Math.floor(a / 10) * 10, ao = a % 10;
    const bt = Math.floor(b / 10) * 10, bo = b % 10;
    return [
      `Tens first: ${at} + ${bt} = ${at + bt}.`,
      `Then the ones: ${ao} + ${bo} = ${ao + bo}.`,
      `${at + bt} + ${ao + bo} = ${a + b}.`,
    ];
  }
  return [`${a} + ${b} = ${a + b}.`, 'Small enough to just know — these are worth memorising.'];
}

function subSteps(a, b) {
  // Counting up beats counting down: it is fewer steps and children make far
  // fewer slips doing it.
  const mid = Math.ceil(b / 10) * 10;
  if (mid > b && mid < a) {
    return [
      `Count up from ${b}, not down from ${a}.`,
      `${b} up to ${mid} is ${mid - b}.`,
      `${mid} up to ${a} is ${a - mid}.`,
      `${mid - b} + ${a - mid} = ${a - b}.`,
    ];
  }
  return [`Count up from ${b} to ${a}.`, `That is ${a - b}.`];
}

function multSteps(a, b) {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  if (lo === 9 || hi === 9) {
    const other = lo === 9 ? hi : lo;
    return [
      `Nines are easiest as tens minus one lot.`,
      `${other} × 10 = ${other * 10}, then take away ${other}.`,
      `${other * 10} − ${other} = ${a * b}.`,
      `Check: the digits of ${a * b} add to ${String(a * b).split('').reduce((n, d) => n + +d, 0)} — always 9 for a nine times fact.`,
    ];
  }
  if (lo === 5) {
    return [`Fives are half of tens.`, `${hi} × 10 = ${hi * 10}.`, `Half of ${hi * 10} is ${a * b}.`];
  }
  if (lo === 4) {
    return [`Four is double, then double again.`, `${hi} doubled is ${hi * 2}.`, `${hi * 2} doubled is ${a * b}.`];
  }
  if (lo === 2) return [`Doubling.`, `${hi} + ${hi} = ${a * b}.`];
  if (a === b) return [`A square: ${a} rows of ${a}.`, `${a} × ${a} = ${a * b}.`, 'Squares are the anchors — learn these and the rest hang off them.'];
  return [
    `Break the ${hi} into ${Math.floor(hi / 10) * 10 || hi - 1} and ${hi - (Math.floor(hi / 10) * 10 || hi - 1)}.`,
    `${lo} × ${Math.floor(hi / 10) * 10 || hi - 1} = ${lo * (Math.floor(hi / 10) * 10 || hi - 1)}.`,
    `${lo} × ${hi - (Math.floor(hi / 10) * 10 || hi - 1)} = ${lo * (hi - (Math.floor(hi / 10) * 10 || hi - 1))}.`,
    `Add them: ${a * b}.`,
  ];
}

function divSteps(a, b) {
  return [
    `Do not divide — ask a times question instead.`,
    `"${b} times what makes ${a}?"`,
    `${b} × ${a / b} = ${a}.`,
    `So ${a} ÷ ${b} = ${a / b}.`,
  ];
}

function factorSteps(n, prime) {
  if (prime) {
    return [
      `Try 2: ${n} is odd, so no.`,
      `Digits add to ${String(n).split('').reduce((s, d) => s + +d, 0)} — not a multiple of 3, so no.`,
      `Does not end in 0 or 5, so 5 is out.`,
      `Nothing up to √${n} fits: ${n} is prime. Type ${n} itself.`,
    ];
  }
  const steps = [];
  let f = 0;
  if (n % 2 === 0) { f = 2; steps.push(`Even, so 2 goes in.`); }
  else if (String(n).split('').reduce((s, d) => s + +d, 0) % 3 === 0) {
    f = 3; steps.push(`Digits add to ${String(n).split('').reduce((s, d) => s + +d, 0)}, a multiple of 3 — so 3 goes in.`);
  } else if (n % 5 === 0) { f = 5; steps.push(`Ends in 0 or 5, so 5 goes in.`); }
  else { for (f = 7; f <= n; f += 2) if (n % f === 0) break; steps.push(`Work up the odd numbers: ${f} goes in.`); }
  steps.push(`${n} ÷ ${f} = ${n / f}, so ${n} = ${f} × ${n / f}.`);
  steps.push(`Either ${f} or ${n / f} is accepted — one factor is enough.`);
  return steps;
}

function percentSteps(pct, total) {
  const ten = total / 10;
  const val = Math.round((pct / 100) * total);
  if (pct === 50) return [`Fifty percent is just half.`, `Half of ${total} is ${val}.`];
  if (pct === 25) return [`Twenty-five percent is half, then half again.`, `Half of ${total} is ${total / 2}.`, `Half of that is ${val}.`];
  if (pct === 10) return [`Ten percent: move the decimal one place left.`, `${total} becomes ${val}.`];
  if (pct % 10 === 0) {
    return [
      `Start at ten percent: move the decimal one place — ${ten}.`,
      `${pct}% is ${pct / 10} lots of that.`,
      `${pct / 10} × ${ten} = ${val}.`,
    ];
  }
  return [
    `Ten percent of ${total} is ${ten}.`,
    `One percent is ${ten / 10}.`,
    `Build ${pct}%: ${Math.floor(pct / 10)} tens and ${pct % 10} ones → ${val}.`,
  ];
}

function powerSteps(n, mode) {
  if (mode === 'square') {
    return [
      `A square is a grid: ${n} rows of ${n}.`,
      `${n} × ${n} = ${n * n}.`,
      `The picture is the answer — count the side, multiply by itself.`,
    ];
  }
  return [
    `A root asks the question backwards.`,
    `"What times itself makes ${n * n}?"`,
    `${n} × ${n} = ${n * n}, so the root is ${n}.`,
  ];
}

function fracOpSteps(p1, q1, p2, q2, op) {
  if (q1 === q2) {
    return [
      `Same bottom number, so the pieces are the same size.`,
      `Just ${op === '+' ? 'add' : 'take away'} the tops: ${p1} ${op} ${p2}.`,
      `That gives ${p1 + (op === '+' ? p2 : -p2)}/${q1} — then reduce if you can.`,
    ];
  }
  return [
    `Different bottoms, so the pieces are different sizes — make them match first.`,
    `${q1} and ${q2} both go into ${q1 * q2}.`,
    `${p1}/${q1} = ${p1 * q2}/${q1 * q2}, and ${p2}/${q2} = ${p2 * q1}/${q1 * q2}.`,
    `Now ${op === '+' ? 'add' : 'subtract'} the tops, then reduce.`,
  ];
}

function integerSteps(a, b, op) {
  const neg = (a < 0) !== (b < 0);
  return [
    `Work out the sizes first, ignoring the signs: ${Math.abs(a)} ${op === 'x' ? '×' : '÷'} ${Math.abs(b)} = ${Math.abs(op === 'x' ? a * b : a / b)}.`,
    `Now the sign. ${neg ? 'One' : 'Both or neither'} of them is negative.`,
    neg ? `Different signs make a negative.` : `Same signs make a positive.`,
    `So the answer is ${op === 'x' ? a * b : a / b}.`,
  ];
}

// --- the entries -----------------------------------------------------------
//
// Order follows the curriculum, which is also the Arcade unlock order, so
// reading top to bottom is reading the game's own progression.

const at = (b) => { b.x = 0; b.y = 0; b.speed = 0; return b; };

// An encounter fresh out of its constructor is a bare trunk: its arms, heads
// and plates are demands it only creates once a fight is running against a
// live game. Drawn like that the Hydra is an empty ellipse and the Kraken has
// no tentacles, which is exactly the thing the page exists to show. So run the
// fight for a moment against a stub that hands out problems and goes nowhere.
function posed(boss, generations = 0) {
  const api = {
    wave: boss.wave,
    demand: (spec, x, y) => {
      const b = new DemandBeast(spec, x, y, 0);
      b.attached = true;
      return b;
    },
    curriculum: (x, y) => {
      const b = new MultBeast(randInt(2, 9), randInt(2, 12), x, y, 0);
      b.attached = true;
      b.speed = 0;
      return b;
    },
    release: (b) => { b.attached = false; },
    hurt: () => {},
    fragment: () => {},
    equation: () => bossSteps('onestep', boss.wave),
  };
  boss.update(1 / 60, api);
  // The Hydra only branches when a head is answered, so to show the tree the
  // pose has to answer some. One generation is the clearest picture: a trunk,
  // and the split that gives the boss its name.
  for (let g = 0; g < generations; g++) {
    for (const b of boss.held) b.state = 'dying';
    boss.update(1 / 60, api);
    boss.update(1 / 60, api);
  }
  return boss;
}

export const ENTRIES = [
  {
    id: 'add', name: 'ADDING', concept: 'add', kind: 'beast',
    where: 'Every tier · Arcade from wave 1',
    what: 'A plain sum falling toward the dome. The first thing you meet and the last thing you stop needing.',
    trick: 'Make ten. 7 + 8 becomes 7 + 3 + 5 — get to a round number, then add what is left.',
    make() {
      const p = makeArith('+', randInt(2, 10), { lo: 1, hi0: 9, hi: 12, step: 1 }, 12);
      return { thing: at(new ArithBeast(p.a, p.b, p.op, 0, 0, 0)), steps: addSteps(p.a, p.b) };
    },
  },
  {
    id: 'sub', name: 'TAKING AWAY', concept: 'sub', kind: 'beast',
    where: 'Every tier · Arcade from wave 1',
    what: 'The same shell, the other operation. Reads identically, so check the sign before you answer.',
    trick: 'Count up, not down. For 15 − 8, go 8→10 (that is 2) then 10→15 (that is 5): 7.',
    make() {
      const p = makeArith('-', randInt(2, 10), { lo: 1, hi0: 9, hi: 14, step: 1 }, 14);
      return { thing: at(new ArithBeast(p.a, p.b, p.op, 0, 0, 0)), steps: subSteps(p.a, p.b) };
    },
  },
  {
    id: 'mult', name: 'TIMES TABLES', concept: 'mult', kind: 'beast',
    where: 'Every tier · Arcade from wave 6',
    what: 'A lattice of dots. The grid is the product itself, so you can count it if you have to.',
    trick: '×9 is ten lots minus one lot, and its digits always add to 9. ×5 is half of ×10. ×4 is double, double. And 7 × 8 = 56 is "5, 6, 7, 8".',
    make() {
      const a = randInt(2, 9), b = randInt(2, 12);
      return { thing: at(new MultBeast(a, b, 0, 0, 0)), steps: multSteps(a, b) };
    },
  },
  {
    id: 'div', name: 'SHARING', concept: 'div', kind: 'beast',
    where: 'Easy from wave 6 · Arcade from wave 16',
    what: 'Dots waiting to be dealt into equal groups. Always divides exactly — there are never leftovers here.',
    trick: 'Turn it into a times question. 48 ÷ 6 is really "6 times what makes 48?" — and you already know that one.',
    make() {
      const p = makeDiv(randInt(4, 14), { divisor: 9, quotient: 9 });
      return { thing: at(new DivBeast(p.a, p.b, 0, 0, 0)), steps: divSteps(p.a, p.b) };
    },
  },
  {
    id: 'factor', name: 'FACTOR ROCKS', concept: 'factor', kind: 'beast',
    where: 'Medium and Hard · Arcade from wave 21',
    what: 'A rock asking "? × ? = n". One factor is enough. Red rocks are prime and cannot be broken — say the number itself.',
    trick: 'Test in order: even means 2. Digits adding to a multiple of 3 means 3. Ending in 0 or 5 means 5. Stop once you pass the square root — there is nothing above it you have not already found.',
    make() {
      const n = splitNumber(randInt(4, 14), false);
      const b = at(new SplitBeast(n, 0, 0, 0));
      b.revealed = true;
      return { thing: b, steps: factorSteps(n, b.prime) };
    },
  },
  {
    id: 'inverse', name: 'VOIDLINGS', concept: 'inverse', kind: 'beast',
    where: 'Medium from wave 6 · Arcade from wave 11',
    what: 'The one enemy that rises instead of falling — it is escaping, and if it gets off the top of the screen it takes shield energy with it.',
    trick: 'It asks for the opposite. Whatever number it shows, answer that number without the minus.',
    make() {
      const v = randInt(2, 12);
      return {
        thing: at(new Voidling(v, 0, 0, 0)),
        steps: [
          `It shows −${v} and wants the total to be zero.`,
          `What cancels −${v}? Its opposite.`,
          `−${v} + ${v} = 0, so answer ${v}.`,
        ],
      };
    },
  },
  {
    id: 'fraction', name: 'FRACTIONS', concept: 'fraction', kind: 'beast',
    where: 'Medium from wave 8 · Arcade from wave 31',
    what: 'A disc cut into pieces with some shaded. Name the shaded part as a fraction — the picture is the whole question.',
    trick: 'Bottom number is how many pieces the whole was cut into; top is how many you have. Then reduce: if both share a factor, divide them both by it.',
    make() {
      const { p, q } = fractionPair(randInt(3, 14));
      const b = at(new FractionBeast(p, q, 0, 0, 0));
      const steps = [
        `The disc is cut into ${q} equal pieces.`,
        `${p} of them are shaded, so that is ${p}/${q}.`,
      ];
      if (b.rq !== q) steps.push(`${p} and ${q} both divide by ${p / b.rp}, so ${p}/${q} reduces to ${b.rp}/${b.rq}.`);
      else steps.push(`Nothing divides into both, so ${p}/${q} is already as simple as it gets.`);
      return { thing: b, steps };
    },
  },
  {
    id: 'power', name: 'POWERS', concept: 'power', kind: 'beast',
    where: 'Hard · Arcade from wave 27',
    what: 'A square grid. Sometimes it wants the area from the side, sometimes the side from the area.',
    trick: 'Learn the squares to 12 and roots come free — a root is just the same fact read backwards.',
    make() {
      const p = makePower(randInt(3, 14));
      return { thing: at(new PowerBeast(p.n, p.mode, 0, 0, 0)), steps: powerSteps(p.n, p.mode) };
    },
  },
  {
    id: 'percent', name: 'PERCENTS', concept: 'percent', kind: 'beast',
    where: 'Hard · Arcade from wave 41',
    what: 'A bar filling toward a share of the total. The fill is the answer, drawn.',
    trick: 'Everything is built from 10%, which is just moving the decimal one place. 5% is half of that; 1% moves it twice. 25% is half of a half.',
    make() {
      const p = makePercent(randInt(3, 14));
      return { thing: at(new PercentBeast(p.pct, p.total, 0, 0, 0)), steps: percentSteps(p.pct, p.total) };
    },
  },
  {
    id: 'fracop', name: 'FRACTION SUMS', concept: 'fracop', kind: 'beast',
    where: 'Hard from wave 3 · Arcade from wave 46',
    what: 'Two fractions to add or subtract. Answer as p/q — reduced.',
    trick: 'Same bottom? Just add the tops. Different bottoms? The pieces are different sizes, so make them match before you touch the tops.',
    make() {
      const p = makeFracOp(randInt(2, 14));
      return {
        thing: at(new FracOpBeast(p.p1, p.q1, p.p2, p.q2, p.op, 0, 0, 0)),
        steps: fracOpSteps(p.p1, p.q1, p.p2, p.q2, p.op),
      };
    },
  },
  {
    id: 'integer', name: 'NEGATIVES', concept: 'integer', kind: 'beast',
    where: 'Hard · Arcade from wave 36',
    what: 'Signed multiplying and dividing. Type a minus sign for a negative answer.',
    trick: 'Do the numbers first and the sign last. Same signs make a positive, different signs make a negative — every time, no exceptions.',
    make() {
      const p = makeInteger(randInt(3, 14));
      return {
        thing: at(new IntegerBeast(p.a, p.b, p.op, 0, 0, 0)),
        steps: integerSteps(p.a, p.b, p.op),
      };
    },
  },

  // --- the encounters ------------------------------------------------------

  {
    id: 'bulwark', scale: 0.5, name: 'THE BULWARK', concept: null, kind: 'boss', wave: 5,
    where: 'Wave 5, and every fifty waves after',
    what: 'A wall of plates that never stops coming down. Each plate is an ordinary problem.',
    trick: 'Nothing pushes it back except answering. It teaches the one lesson the rest of the game assumes: speed is a weapon, not a bonus.',
    make: () => ({ thing: posed(new Bulwark(0, 0, 5)), steps: [
      'The wall descends the whole time you are looking at it.',
      'Every plate you break shoves it back up.',
      'Break all six and the core opens for the finishing shot.',
    ] }),
  },
  {
    id: 'kraken', scale: 0.62, name: 'THE KRAKEN', concept: null, kind: 'boss', wave: 10,
    where: 'Wave 10',
    what: 'A core with arms spiralling around it, each holding a problem. Every few seconds an arm lets go and drives at the planet.',
    trick: 'Watch which arm is glowing — that is the one about to launch, and you get about a second of warning. Kill it first.',
    make: () => ({ thing: posed(new Kraken(0, 0, 10, 5)), steps: [
      'Arms fall at three times a normal descent, so time is the pressure, not difficulty.',
      'Clearing an arm early does not spawn a replacement — being quick genuinely helps.',
      'The last arm does not kill it. The core opens and one shot finishes it.',
    ] }),
  },
  {
    id: 'twins', scale: 0.72, name: 'THE TWINS', concept: null, kind: 'boss', wave: 15,
    where: 'Wave 15',
    what: 'Two hulls sharing one health pool, holding different expressions with the same answer.',
    trick: 'They always match. 6 × 4 and 3 × 8 are the same number wearing different clothes — work out one and you have both.',
    make: () => ({ thing: posed(new Twins(0, 0, 15)), steps: [
      'Kill one and a clock starts on the other.',
      'Let the clock run out and the fallen twin comes back — nothing gained.',
      'Three pairs, both down inside the window each time.',
    ] }),
  },
  {
    id: 'hydra', scale: 0.34, name: 'THE HYDRA', concept: null, kind: 'boss', wave: 20,
    where: 'Wave 20',
    what: 'One head holding one number. Solve it and it does not die — it halves into two heads, and those halve again.',
    trick: 'It only ever asks you to halve. By the last generation there are four heads and every one is trivial — the fear is the shape, not the maths.',
    make: () => ({ thing: posed(new Hydra(0, 0, 20), 1), steps: [
      '24 becomes two 12s, which become four 6s.',
      'Seven solves in all, and each is easier than the last.',
      'The tree you are looking at is the boss’s body and its health bar at once.',
    ] }),
  },
  {
    id: 'remainder', scale: 0.9, name: 'THE REMAINDER', concept: null, kind: 'boss', wave: 25,
    where: 'Wave 25',
    what: 'One big number. You fire divisors at it, and it wants four different ones that go in exactly.',
    trick: 'Start with the easy tests — 2, 3, 5 — before guessing. A wrong divisor does not just fail: the leftover breaks off and comes at you.',
    make: () => ({ thing: posed(new Remainder(0, 0, 25)), steps: [
      'A divisor that fits cleaves the disc into that many equal wedges.',
      'One that does not leaves a remainder, which becomes an enemy.',
      'Already-used divisors are listed underneath — do not repeat one.',
    ] }),
  },
  {
    id: 'balance', scale: 0.5, name: 'THE BALANCE', concept: null, kind: 'boss', wave: 30,
    where: 'Wave 30',
    what: 'A beam with a pan at each end. One holds a number, the other an expression with a hole in it.',
    trick: 'The tilt is your health — there is no bar to read. Level means safe, all the way over means the low pan is grinding on your dome.',
    make: () => ({ thing: posed(new Balance(0, 0, 30)), steps: [
      'Read the two pans as one equation: the left side must equal the right.',
      'Each correct answer levels the beam instantly.',
      'Leave it tipped and it starts costing you cores.',
    ] }),
  },
  {
    id: 'cipher', scale: 0.95, name: 'THE CIPHER', concept: null, kind: 'boss', wave: 35,
    where: 'Wave 35',
    what: 'No problem at all — only clues. Even. Between twenty and forty. A multiple of seven. Fire the number that fits all three.',
    trick: 'A wrong guess is not a penalty here, it is information: every tumbler your guess satisfies lights up. Guess deliberately and narrow it.',
    make: () => ({ thing: posed(new Cipher(0, 0, 35)), steps: [
      'Three clues, three tumbler rings on the vault.',
      'Each guess turns whichever rings it fits.',
      'Exactly one number satisfies all three — the clues always pin it down.',
    ] }),
  },
  {
    id: 'prism', scale: 0.9, name: 'THE PRISM', concept: null, kind: 'boss', wave: 40,
    where: 'Wave 40',
    what: 'A crystal holding one quantity, shown only as a filled bar. Three facets want it three ways: as a fraction, a decimal, and a percent.',
    trick: 'Read the bar as a fraction first — count the ticks. The decimal and the percent both fall out of it without any more thinking.',
    make: () => ({ thing: posed(new Prism(0, 0, 40)), steps: [
      'No numerals are given: reading the amount off the bar is half the problem.',
      'Any equivalent fraction is accepted — 2/4 is as right as 1/2.',
      'Clear all three facets and the crystal stops bending your shots away.',
    ] }),
  },
  {
    id: 'nought', scale: 0.85, name: 'THE NOUGHT', concept: null, kind: 'boss', wave: 45,
    where: 'Wave 45',
    what: 'A hole that inverts everything inside its reach — the sky, your dome, the colours. It spreads while you leave it alone.',
    trick: 'Every question is the same question: what cancels this to zero? Answer the opposite of whatever it shows.',
    make: () => ({ thing: posed(new Nought(0, 0, 45)), steps: [
      'The inversion is the health bar — how much of the screen it has taken.',
      'Each answer pushes it back.',
      'Five cancellations and it collapses.',
    ] }),
  },
  {
    id: 'echo', scale: 0.3, name: 'THE ECHO', concept: null, kind: 'boss', wave: 50,
    where: 'Wave 50 — the last one',
    what: 'A dark mirror of your own planet, and its attacks are your own missed facts, pulled out of your record as you played.',
    trick: 'There is no trick. It is built from exactly the things you keep getting wrong, so the only preparation is the rest of the game.',
    make: () => ({ thing: posed(new Echo(0, 0, 50, [])), steps: [
      'Every fact it throws is one you have fumbled before.',
      'Solve one and it is burned out of the mirror permanently.',
      'A player who never misses gets an almost empty mirror — which is the point.',
    ] }),
  },
];

export const byId = (id) => ENTRIES.find((e) => e.id === id) || ENTRIES[0];
