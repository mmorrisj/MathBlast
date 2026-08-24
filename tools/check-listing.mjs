// Checks the Play listing copy against Play's field limits, and writes the
// paste-ready plain text next to it.
//
//   node tools/check-listing.mjs
//
// The copy lives in docs/store/listing.md as markdown blockquotes so it reads
// as a document; Play's fields are plain text. This strips the quote markers
// and the bold markers, counts what is actually left, and fails if a field is
// over. Getting this wrong is a form that silently truncates in the console.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'docs/store/listing.md');

// Play's limits, as of writing. They have not moved in years, but they are the
// kind of thing that does, so they are named rather than inlined.
const LIMITS = { title: 30, short: 80, full: 4000 };

const md = readFileSync(SRC, 'utf8');

// The block under a heading, up to the next heading or `---` rule.
function section(heading) {
  const start = md.indexOf(`## ${heading}\n`);
  if (start === -1) throw new Error(`no "## ${heading}" heading in ${SRC}`);
  const rest = md.slice(start + heading.length + 4);
  const end = rest.search(/\n(?:## |---)/);
  return end === -1 ? rest : rest.slice(0, end);
}

// Quoted lines only -- the prose around them is commentary, not copy.
function copy(heading) {
  return section(heading)
    .split('\n')
    .filter((l) => l.startsWith('>'))
    .map((l) => l.replace(/^>\s?/, ''))
    .join('\n')
    .replace(/\*\*/g, '')              // Play's field is plain text
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const fields = {
  title: copy('App title'),
  short: copy('Short description'),
  full: copy('Full description'),
};

let bad = 0;
for (const [name, text] of Object.entries(fields)) {
  const n = [...text].length;             // Play counts characters, not bytes
  const limit = LIMITS[name];
  const ok = n <= limit && n > 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(6)} ${String(n).padStart(4)}/${limit}`);
}

const OUT = join(ROOT, 'docs/store/full-description.txt');
writeFileSync(OUT, fields.full + '\n');
console.log(`\nwrote docs/store/full-description.txt (${[...fields.full].length} chars)`);

if (bad) {
  console.error(`\n${bad} field(s) over the limit -- Play truncates silently.`);
  process.exit(1);
}
