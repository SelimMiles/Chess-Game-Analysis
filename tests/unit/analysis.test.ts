import { describe, expect, it } from 'vitest';
import { gameAccuracy, moveAccuracy } from '../../src/lib/analysis/accuracy';
import { classifyMove } from '../../src/lib/analysis/classify';
import { explainMove } from '../../src/lib/analysis/explain';
import { reviewGame } from '../../src/lib/analysis/review';
import {
  formatPositionEval,
  formatScore,
  positionWinPercent,
  toWhiteScore,
  winPercent,
} from '../../src/lib/analysis/score';
import { parseSingleGame, type GameMove } from '../../src/lib/chess/game';
import type { PositionEval, Score } from '../../src/lib/engine/types';

const ev = (turn: 'white' | 'black', ...lines: [Score, string[]][]): PositionEval => ({
  turn,
  depth: 16,
  lines: lines.map(([score, pv], i) => ({ multipv: i + 1, depth: 16, score, pv })),
});

const move = (overrides: Partial<GameMove> = {}): GameMove => ({
  ply: 1,
  san: 'e4',
  uci: 'e2e4',
  from: 'e2',
  to: 'e4',
  color: 'white',
  moveNumber: 1,
  fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  capture: false,
  check: false,
  castle: false,
  legalMoves: 20,
  ...overrides,
});

describe('scores', () => {
  it('flips engine scores to White’s view', () => {
    expect(toWhiteScore({ cp: 50 }, 'black')).toEqual({ cp: -50 });
    expect(toWhiteScore({ mate: 3 }, 'black')).toEqual({ mate: -3 });
    expect(toWhiteScore({ mate: 0 }, 'white')).toEqual({ mate: -1 });
  });

  it('maps evaluations to win percentages like Lichess', () => {
    expect(winPercent(0)).toBe(50);
    expect(winPercent(100)).toBeCloseTo(59.1, 1);
    expect(winPercent(-300)).toBeCloseTo(24.9, 1);
    expect(winPercent(5000)).toBe(winPercent(1000));
    expect(positionWinPercent({ turn: 'black', depth: 0, lines: [], terminal: 'checkmate' })).toBe(100);
    expect(positionWinPercent({ turn: 'white', depth: 0, lines: [], terminal: 'stalemate' })).toBe(50);
  });

  it('formats scores', () => {
    expect(formatScore({ cp: 123 })).toBe('+1.23');
    expect(formatScore({ cp: -40 })).toBe('−0.40');
    expect(formatScore({ cp: 0 })).toBe('0.00');
    expect(formatScore({ mate: -2 })).toBe('−M2');
    expect(formatPositionEval({ turn: 'white', depth: 0, lines: [], terminal: 'checkmate' })).toBe('0-1');
  });
});

describe('accuracy', () => {
  it('rewards moves that keep the evaluation', () => {
    expect(moveAccuracy(60, 60)).toBe(100);
    expect(moveAccuracy(60, 65)).toBe(100);
    expect(moveAccuracy(60, 50)).toBeGreaterThan(moveAccuracy(60, 40));
    expect(moveAccuracy(100, 0)).toBe(0);
  });

  it('scores a flawless game at 100% and penalizes the side that blunders', () => {
    expect(gameAccuracy([55, 55, 55, 55, 55], 'white')).toMatchObject({ white: 100, black: 100 });
    const acc = gameAccuracy([55, 55, 55, 10, 10, 10], 'white');
    expect(acc.white).toBeLessThan(80);
    expect(acc.black).toBe(100);
    expect(acc.moves).toHaveLength(5);
  });

  it('handles games where Black moves first', () => {
    const acc = gameAccuracy([50, 90, 90], 'black');
    expect(acc.black).toBeLessThan(acc.white!);
  });
});

describe('classifyMove', () => {
  const before = ev('white', [{ cp: 30 }, ['e2e4']], [{ cp: 20 }, ['d2d4']]);

  it('labels the engine move as best', () => {
    const r = classifyMove({ move: move(), before, after: ev('black', [{ cp: 28 }, ['e7e5']]), isBook: false });
    expect(r?.classification).toBe('best');
    expect(r?.isBest).toBe(true);
  });

  it('labels moves by how much they give away', () => {
    const label = (cpAfter: number) =>
      classifyMove({
        move: move({ uci: 'g2g4', san: 'g4' }),
        before,
        after: ev('black', [{ cp: cpAfter }, ['e7e5']]),
        isBook: false,
      })?.classification;
    expect(label(28)).toBe('excellent');
    expect(label(5)).toBe('good');
    expect(label(-40)).toBe('inaccuracy');
    expect(label(-150)).toBe('mistake');
    expect(label(-400)).toBe('blunder');
    expect(label(-900)).toBe('blunder');
  });

  it('labels book and forced moves', () => {
    const fine = ev('black', [{ cp: 10 }, ['e7e5']]);
    const awful = ev('black', [{ cp: -300 }, ['e7e5']]);
    expect(classifyMove({ move: move({ uci: 'g2g4' }), before, after: fine, isBook: true })?.classification).toBe('book');
    // Named traps are in the opening books too, but a losing move is still called out.
    expect(classifyMove({ move: move({ uci: 'g2g4' }), before, after: awful, isBook: true })?.classification).toBe('blunder');
    expect(classifyMove({ move: move({ legalMoves: 1 }), before, after: awful, isBook: false })?.classification).toBe('forced');
  });

  it('labels the only good move as great', () => {
    const critical = ev('white', [{ cp: 250 }, ['e2e4']], [{ cp: -150 }, ['d2d4']]);
    const r = classifyMove({ move: move(), before: critical, after: ev('black', [{ cp: 240 }, ['e7e5']]), isBook: false });
    expect(r?.classification).toBe('great');
  });

  it('does not call an obvious recapture great', () => {
    const critical = ev('white', [{ cp: 0 }, ['d1d5']], [{ cp: -900 }, ['a2a3']]);
    const recapture = move({ uci: 'd1d5', san: 'Qxd5', from: 'd1', to: 'd5', capture: true });
    const previous = move({ color: 'black', capture: true, to: 'd5' });
    const r = classifyMove({ move: recapture, before: critical, after: ev('black', [{ cp: 0 }, ['a7a6']]), isBook: false, previous });
    expect(r?.classification).toBe('best');
  });

  it('waits for both evaluations', () => {
    expect(classifyMove({ move: move(), before: ev('white'), after: ev('black'), isBook: false })).toBeUndefined();
  });
});

describe('explainMove', () => {
  it('explains a blunder that allows mate', () => {
    // 1. f3 e5 2. g4?? allows Qh4#.
    const game = parseSingleGame('1. f3 e5 2. g4 *');
    const g4 = game.moves[2];
    const before = ev('white', [{ cp: -60 }, ['b1c3', 'b8c6']]);
    const after = ev('black', [{ mate: -1 }, ['d8h4']]);
    const review = classifyMove({ move: g4, before, after, isBook: false })!;
    expect(review.classification).toBe('blunder');
    const text = explainMove(g4, review, before, after);
    expect(text.headline).toBe('g4 is a blunder');
    expect(text.details[0]).toBe('It allows Black to force mate in 1.');
    expect(text.details).toContain('Nc3 was best.');
    expect(text.bestLine?.text).toBe('2. Nc3 Nc6');
    expect(text.replyLine?.text).toBe('2... Qh4#');
  });
});

describe('reviewGame', () => {
  it('reviews analyzed moves and computes accuracy only when complete', () => {
    const game = parseSingleGame('1. e4 e5 *');
    const evals = [
      ev('white', [{ cp: 20 }, ['e2e4']]),
      ev('black', [{ cp: 25 }, ['e7e5']]),
      ev('white', [{ cp: 30 }, ['g1f3']]),
    ];
    const partial = reviewGame(game, [evals[0], evals[1], undefined], 0);
    expect(partial.reviews[0]?.classification).toBe('best');
    expect(partial.reviews[1]).toBeUndefined();
    expect(partial.accuracy).toBeUndefined();

    const full = reviewGame(game, evals, 2);
    expect(full.complete).toBe(true);
    expect(full.reviews.map((r) => r?.classification)).toEqual(['book', 'book']);
    expect(full.accuracy?.white).toBeGreaterThan(90);
    expect(full.summary.counts.white.book).toBe(1);
  });
});
