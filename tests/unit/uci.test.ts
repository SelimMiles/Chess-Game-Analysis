import { describe, expect, it } from 'vitest';
import { LineCollector, parseBestMove, parseInfoLine } from '../../src/lib/engine/uci';

describe('parseInfoLine', () => {
  it('reads a centipawn line', () => {
    const info = parseInfoLine(
      'info depth 18 seldepth 25 multipv 2 score cp -34 nodes 123456 nps 400000 hashfull 120 time 300 pv e7e5 g1f3 b8c6',
    );
    expect(info).toEqual({
      depth: 18,
      seldepth: 25,
      multipv: 2,
      score: { cp: -34 },
      nodes: 123456,
      nps: 400000,
      time: 300,
      pv: ['e7e5', 'g1f3', 'b8c6'],
    });
  });

  it('reads mate scores and bounds', () => {
    expect(parseInfoLine('info depth 12 multipv 1 score mate -3 pv a1a2')?.score).toEqual({ mate: -3 });
    expect(parseInfoLine('info depth 12 score cp 50 lowerbound nodes 1 pv a1a2')?.bound).toBe('lower');
    expect(parseInfoLine('info depth 12 score cp 50 upperbound pv a1a2')?.bound).toBe('upper');
  });

  it('skips wdl values', () => {
    expect(parseInfoLine('info depth 5 score cp 10 wdl 300 600 100 pv e2e4')?.pv).toEqual(['e2e4']);
  });

  it('ignores lines without a score', () => {
    expect(parseInfoLine('info string NNUE evaluation using nn.nnue')).toBeNull();
    expect(parseInfoLine('info depth 10 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
  });
});

describe('parseBestMove', () => {
  it('reads best moves and empty results', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ bestmove: 'e2e4' });
    expect(parseBestMove('bestmove (none)')).toEqual({ bestmove: null });
    expect(parseBestMove('info depth 1')).toBeUndefined();
  });
});

describe('LineCollector', () => {
  it('keeps the deepest exact line per slot', () => {
    const c = new LineCollector();
    c.add(parseInfoLine('info depth 10 multipv 1 score cp 20 pv e2e4')!);
    c.add(parseInfoLine('info depth 10 multipv 2 score cp 10 pv d2d4')!);
    expect(c.add(parseInfoLine('info depth 10 multipv 1 score cp 25 lowerbound pv g1f3')!)).toBe(false);
    c.add(parseInfoLine('info depth 11 multipv 1 score cp 30 pv c2c4')!);
    expect(c.lines().map((l) => l.pv[0])).toEqual(['c2c4', 'd2d4']);
    expect(c.depth).toBe(11);
  });
});
