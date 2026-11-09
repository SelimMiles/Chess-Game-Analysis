import type { Key } from 'chessground/types';
import type { ParsedGame } from '../lib/chess/game';

export interface ExploreMove {
  san: string;
  uci: string;
  from: Key;
  to: Key;
  fen: string;
  capture: boolean;
  check: boolean;
  castle: boolean;
}

/** A side line the user is trying out on the board, branching from the game. */
export interface Explore {
  /** Main-line ply the side line starts from. */
  basePly: number;
  moves: ExploreMove[];
  /** How many of `moves` are currently played on the board. */
  index: number;
}

export interface BoardPosition {
  fen: string;
  /** Moves from the game's initial position, in engine UCI (for repetition detection). */
  uciMoves: string[];
  lastMove?: [Key, Key];
  check: boolean;
  turn: 'white' | 'black';
  /** Main-line ply when not exploring. */
  ply?: number;
  /** A stable id for "the position on the board", used to match live analysis. */
  key: string;
}

export function boardPosition(game: ParsedGame, ply: number, explore?: Explore): BoardPosition {
  const mainMoves = game.moves.slice(0, explore ? explore.basePly : ply);
  if (explore && explore.index > 0) {
    const played = explore.moves.slice(0, explore.index);
    const last = played[played.length - 1];
    return {
      fen: last.fen,
      uciMoves: [...mainMoves.map((m) => m.uci), ...played.map((m) => m.uci)],
      lastMove: [last.from, last.to],
      check: last.check,
      turn: last.fen.split(' ')[1] === 'b' ? 'black' : 'white',
      key: `${game.id}:${explore.basePly}:${played.map((m) => m.uci).join(',')}`,
    };
  }
  const p = explore ? explore.basePly : ply;
  const move = game.moves[p - 1];
  const fen = game.fens[p];
  return {
    fen,
    uciMoves: mainMoves.map((m) => m.uci),
    lastMove: move ? [move.from as Key, move.to as Key] : undefined,
    check: move?.check ?? false,
    turn: fen.split(' ')[1] === 'b' ? 'black' : 'white',
    ply: p,
    key: `${game.id}:${p}:`,
  };
}
