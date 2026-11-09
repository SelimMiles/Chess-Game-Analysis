import { parsePgn } from 'chessops/pgn';
import { describe, expect, it } from 'vitest';
import { reviewGame } from '../../src/lib/analysis/review';
import { parseSingleGame } from '../../src/lib/chess/game';
import { annotatedPgn, pgnFileName } from '../../src/lib/chess/pgn-export';
import type { PositionEval } from '../../src/lib/engine/types';

describe('annotatedPgn', () => {
  const game = parseSingleGame(`[White "Sam"]
[Black "Alex"]
[Date "2026.11.01"]
[Result "0-1"]

1. f3 { [%clk 0:05:00] } e5 { [%clk 0:05:00] } 2. g4 { [%clk 0:04:58] } Qh4# { [%clk 0:04:55] } 0-1`);
  const evals: PositionEval[] = [
    { turn: 'white', depth: 14, lines: [{ multipv: 1, depth: 14, score: { cp: 20 }, pv: ['e2e4'] }] },
    { turn: 'black', depth: 14, lines: [{ multipv: 1, depth: 14, score: { cp: -40 }, pv: ['e7e5'] }] },
    { turn: 'white', depth: 14, lines: [{ multipv: 1, depth: 14, score: { cp: -60 }, pv: ['b1c3', 'b8c6'] }] },
    { turn: 'black', depth: 14, lines: [{ multipv: 1, depth: 14, score: { mate: -1 }, pv: ['d8h4'] }] },
    { turn: 'white', depth: 0, lines: [], terminal: 'checkmate' },
  ];
  const review = reviewGame(game, evals, 0);
  const pgn = annotatedPgn(game, evals, review.reviews, {
    annotator: 'Blunderscope',
    accuracy: review.accuracy,
  });

  it('adds evals, glyphs, clocks and the better line', () => {
    expect(pgn).toContain('[Annotator "Blunderscope"]');
    expect(pgn).toContain('2. g4 $4');
    expect(pgn).toContain('Blunder. Nc3 was best.');
    expect(pgn).toContain('[%eval #-1');
    expect(pgn).toContain('[%clk 0:04:58]');
    expect(pgn).toContain('( 2. Nc3 Nc6 )');
    expect(pgn).toMatch(/Accuracy: White \d+\.\d%, Black 100\.0%/);
  });

  it('produces PGN that parses back to the same game', () => {
    const [parsed] = parsePgn(pgn);
    expect([...parsed.moves.mainline()].map((n) => n.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(parsed.headers.get('Result')).toBe('0-1');
  });

  it('builds a safe file name', () => {
    expect(pgnFileName(game)).toBe('Sam-vs-Alex-2026.pgn');
  });
});
