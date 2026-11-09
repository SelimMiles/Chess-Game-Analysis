// Builds src/data/openings.json from the Lichess opening dataset
// (https://github.com/lichess-org/chess-openings, CC0 public domain).
//
// Usage:
//   1. Download a.tsv … e.tsv from that repository into a folder.
//   2. node scripts/build-openings.mjs path/to/folder
//
// Output format (kept small on purpose):
//   book:  hashes of every position that occurs in a named opening line
//   named: hash -> [ECO code, opening name] for the final position of each line
// Hashes are cyrb53 of the position's EPD, written in base 36. The same function
// lives in src/lib/openings/hash.ts; a unit test checks the two stay in sync.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('Usage: node scripts/build-openings.mjs <folder with a.tsv … e.tsv>');
  process.exit(1);
}

function cyrb53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const epdHash = (pos) => cyrb53(makeFen(pos.toSetup(), { epd: true }));

const book = new Set();
const named = {};
let lines = 0;

for (const letter of ['a', 'b', 'c', 'd', 'e']) {
  const rows = readFileSync(join(sourceDir, `${letter}.tsv`), 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const pos = Chess.default();
    const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
    for (const san of sans) {
      const move = parseSan(pos, san);
      if (!move) throw new Error(`Illegal move ${san} in ${eco} ${name}`);
      pos.play(move);
      book.add(epdHash(pos));
    }
    const key = epdHash(pos);
    if (!named[key]) named[key] = [eco, name];
    lines++;
  }
}

const out = join(root, 'src', 'data', 'openings.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ book: [...book].sort(), named }));
console.log(`${lines} lines, ${book.size} book positions, ${Object.keys(named).length} named → ${out}`);
