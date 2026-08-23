// Copies the shipped app into www/, which is what Capacitor packages into the
// Android build.
//
//   node tools/build-www.mjs
//
// The file list comes from tools/gen-sw.mjs, so "what the service worker
// precaches" and "what goes in the APK" cannot disagree -- an asset missing
// from one would be missing from the other.

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assets } from './gen-sw.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'www');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const files = assets()
  .map((p) => p.replace(/^\.\//, ''))
  .filter(Boolean)              // './' is the navigation entry, not a file
  .concat(['manifest.webmanifest', 'sw.js']);

for (const rel of files) {
  mkdirSync(join(OUT, dirname(rel)), { recursive: true });
  cpSync(join(ROOT, rel), join(OUT, rel));
}
console.log(`www/: ${files.length} files`);
