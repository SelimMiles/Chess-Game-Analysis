import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import data from '../../src/data/openings.json';
import { parseSingleGame } from '../../src/lib/chess/game';
import { OpeningBook } from '../../src/lib/openings/openings';
import { cyrb53 } from '../../src/lib/openings/hash';

const book = new OpeningBook(data as never);

describe('OpeningBook', () => {
  it('names openings along a game', () => {
    const game = parseSingleGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. h4 *');
    const openings = book.openingsAlong(game.fens);
    expect(openings[0]).toBeUndefined();
    expect(openings[5]?.name).toBe('Ruy Lopez');
    expect(openings[5]?.eco).toBe('C60');
    expect(openings.at(-1)?.name).toMatch(/^Ruy Lopez: (Closed|Morphy Defense)/);
  });

  it('knows where theory ends', () => {
    const game = parseSingleGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. h4 *');
    expect(book.bookPlies(game.fens)).toBe(10);
    const odd = parseSingleGame('1. h4 h5 2. Rh3 Rh6 *');
    expect(book.bookPlies(odd.fens)).toBeLessThan(4);
  });

  it('follows transpositions', () => {
    const a = parseSingleGame('1. d4 Nf6 2. c4 e6 *');
    const b = parseSingleGame('1. c4 e6 2. d4 Nf6 *');
    expect(book.nameOf(a.fens[4])).toEqual(book.nameOf(b.fens[4]));
  });

  it('uses the same hash as the build script', () => {
    const script = readFileSync(new URL('../../scripts/build-openings.mjs', import.meta.url), 'utf8');
    const appHash = readFileSync(new URL('../../src/lib/openings/hash.ts', import.meta.url), 'utf8');
    const body = (src: string) => src.slice(src.indexOf('let h1'), src.indexOf('.toString(36)'));
    expect(body(script).replace(/\s+/g, '')).toBe(body(appHash).replace(/\s+/g, ''));
    expect(cyrb53('abc')).toBe(cyrb53('abc'));
  });
});
