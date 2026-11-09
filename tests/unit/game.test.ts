import { describe, expect, it } from 'vitest';
import { SAMPLE_GAMES } from '../../src/data/samples';
import { looksLikeFen, parseGames, parseSingleGame } from '../../src/lib/chess/game';
import { formatLine, uciLineToSan } from '../../src/lib/chess/moves';

const opera = SAMPLE_GAMES.find((g) => g.id === 'opera')!.pgn;

describe('parseSingleGame', () => {
  it('parses all sample games and ends them correctly', () => {
    const plies: Record<string, number> = { opera: 33, century: 82, immortal: 45 };
    for (const sample of SAMPLE_GAMES) {
      const game = parseSingleGame(sample.pgn);
      expect(game.moves).toHaveLength(plies[sample.id]);
      expect(game.fens).toHaveLength(plies[sample.id] + 1);
      expect(game.termination).toBe('checkmate');
      expect(game.standardStart).toBe(true);
    }
  });

  it('reads headers, castling and checks', () => {
    const game = parseSingleGame(opera);
    expect(game.headers.White).toBe('Paul Morphy');
    expect(game.result).toBe('1-0');
    const castle = game.moves.find((m) => m.san === 'O-O-O')!;
    expect(castle.uci).toBe('e1c1');
    expect([castle.from, castle.to]).toEqual(['e1', 'c1']);
    expect(castle.castle).toBe(true);
    const last = game.moves.at(-1)!;
    expect(last.san).toBe('Rd8#');
    expect(last.check).toBe(true);
    expect(last.moveNumber).toBe(17);
    expect(last.color).toBe('white');
  });

  it('marks captures, including en passant', () => {
    const game = parseSingleGame('1. e4 Nf6 2. e5 d5 3. exd6 exd6 *');
    expect(game.moves.map((m) => m.capture)).toEqual([false, false, false, false, true, true]);
  });

  it('counts legal moves so forced moves can be detected', () => {
    expect(parseSingleGame('1. e4 *').moves[0].legalMoves).toBe(20);
    // After Rh8+ the black king's only legal move is Kb7.
    const game = parseSingleGame('[SetUp "1"]\n[FEN "k7/p7/8/8/8/8/8/K6R w - - 0 1"]\n\n1. Rh8+ Kb7 *');
    expect(game.moves[1].legalMoves).toBe(1);
  });

  it('reads clock comments', () => {
    const game = parseSingleGame('1. e4 { [%clk 0:03:00] } e5 { [%clk 0:02:58.5] } *');
    expect(game.moves.map((m) => m.clock)).toEqual([180, 178.5]);
    expect(game.pgn).toContain('[%clk 0:02:58.5]');
  });

  it('ignores variations and comments when building the main line', () => {
    const game = parseSingleGame('1. e4 (1. d4 d5) e5 {a comment} 2. Nf3 $1 Nc6 *');
    expect(game.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('supports games starting from a FEN', () => {
    const game = parseSingleGame(`[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]

1. e4 Kd7 *`);
    expect(game.standardStart).toBe(false);
    expect(game.moves[0].fenBefore).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  });

  it('writes Chess960 castling as king-takes-rook for the engine', () => {
    const game = parseSingleGame(`[Variant "Chess960"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/8/R4KR1 w AG - 0 1"]

1. O-O *`);
    expect(game.chess960).toBe(true);
    expect(game.moves[0].uci).toBe('f1g1');
    expect(game.moves[0].to).toBe('g1');
  });

  it('gives a readable error for illegal moves', () => {
    expect(() => parseSingleGame('1. e4 e5 2. Ke3 *')).toThrow(/Illegal move "Ke3" at 2\./);
  });

  it('rejects unsupported variants', () => {
    expect(() => parseSingleGame('[Variant "Atomic"]\n\n1. e4 *')).toThrow(/Atomic/);
  });

  it('gives the same id for the same game', () => {
    expect(parseSingleGame(opera).id).toBe(parseSingleGame(opera).id);
    expect(parseSingleGame(opera).id).not.toBe(parseSingleGame('1. e4 *').id);
  });
});

describe('parseGames', () => {
  it('reads several games and reports the broken ones', () => {
    const text = `${opera}\n\n[Event "Broken"]\n\n1. e4 e5 2. Ke3 *\n\n[Event "Short"]\n\n1. d4 d5 *`;
    const { games, errors } = parseGames(text);
    expect(games.map((g) => g.headers.Event)).toEqual(['Paris Opera', 'Short']);
    expect(errors).toHaveLength(1);
  });

  it('turns a FEN into a position to analyze', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    expect(looksLikeFen(fen)).toBe(true);
    const { games } = parseGames(fen);
    expect(games[0].moves).toHaveLength(0);
    expect(games[0].initialFen).toBe(fen);
  });

  it('explains empty input', () => {
    expect(parseGames('   ').errors[0]).toMatch(/Paste/);
    expect(parseGames('hello there').errors[0]).toMatch(/Couldn't find any moves/);
  });
});

describe('move helpers', () => {
  it('converts engine lines to numbered SAN', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const sans = uciLineToSan(fen, ['h5f7']);
    expect(sans).toEqual(['Qxf7#']);
    expect(formatLine(['Nf6', 'O-O', 'Be7'], 5, false)).toBe('5... Nf6 6. O-O Be7');
    expect(uciLineToSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e2e4'])).toEqual(['e4']);
  });

  it('understands engine castling notation', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    expect(uciLineToSan(fen, ['e1g1', 'e8c8'])).toEqual(['O-O', 'O-O-O']);
  });
});

describe('isEscape', () => {
  it('spots a piece running away from an attack', async () => {
    const { isEscape } = await import('../../src/lib/chess/tactics');
    const retreat = parseSingleGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bc4 *').moves[6];
    const trade = parseSingleGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 *').moves[6];
    const quiet = parseSingleGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 *').moves[4];
    expect(isEscape(retreat)).toBe(true);
    expect(isEscape(trade)).toBe(false);
    expect(isEscape(quiet)).toBe(false);
  });
});
