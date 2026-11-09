import { castlingSide, normalizeMove, type Position } from 'chessops/chess';
import { makeSanAndPlay } from 'chessops/san';
import { kingCastlesTo, makeSquare, makeUci, parseUci } from 'chessops/util';
import type { Move, NormalMove, SquareName } from 'chessops/types';
import { parseFen } from 'chessops/fen';
import { Chess } from 'chessops/chess';

/** Builds a position from a FEN string, throwing a readable error when it is invalid. */
export function positionFromFen(fen: string): Chess {
  const setup = parseFen(fen.trim());
  if (setup.isErr) throw new Error(`Invalid FEN: ${fen}`);
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) throw new Error(`Impossible position: ${fen}`);
  return pos.value;
}

/**
 * Converts a (normalized, king-takes-rook) chessops move to the UCI string an
 * engine expects. Standard chess castles as e1g1; Chess960 keeps king-takes-rook.
 */
export function toEngineUci(pos: Position, move: Move, chess960: boolean): string {
  if ('from' in move && !chess960) {
    const side = castlingSide(pos, move);
    if (side) return makeSquare(move.from) + makeSquare(kingCastlesTo(pos.turn, side));
  }
  return makeUci(move);
}

/** Parses an engine UCI move in the context of a position. Returns undefined if illegal. */
export function fromEngineUci(pos: Position, uci: string): NormalMove | undefined {
  const parsed = parseUci(uci);
  if (!parsed || !('from' in parsed)) return undefined;
  const move = normalizeMove(pos, parsed) as NormalMove;
  return pos.isLegal(move) ? move : undefined;
}

/** Squares to highlight for a move on the board. Castling shows the king's real destination. */
export function displaySquares(pos: Position, move: NormalMove): [SquareName, SquareName] {
  const side = castlingSide(pos, move);
  const to = side ? kingCastlesTo(pos.turn, side) : move.to;
  return [makeSquare(move.from), makeSquare(to)];
}

/** Converts a list of UCI moves starting at `fen` into SAN, stopping at the first illegal move. */
export function uciLineToSan(fen: string, uciMoves: readonly string[], max = Infinity): string[] {
  const pos = positionFromFen(fen);
  const sans: string[] = [];
  for (const uci of uciMoves) {
    if (sans.length >= max) break;
    const move = fromEngineUci(pos, uci);
    if (!move) break;
    sans.push(makeSanAndPlay(pos, move));
  }
  return sans;
}

/** Formats SAN moves with move numbers, e.g. "12. Nf3 Nc6 13. O-O" or "12... Nc6 13. O-O". */
export function formatLine(sans: readonly string[], startFullmove: number, whiteToMove: boolean): string {
  const parts: string[] = [];
  let moveNumber = startFullmove;
  let white = whiteToMove;
  sans.forEach((san, i) => {
    if (white) parts.push(`${moveNumber}. ${san}`);
    else parts.push(i === 0 ? `${moveNumber}... ${san}` : san);
    if (!white) moveNumber++;
    white = !white;
  });
  return parts.join(' ');
}

/** Splits a FEN into the fields needed to number a line of moves. */
export function fenTurnAndMove(fen: string): { whiteToMove: boolean; fullmove: number } {
  const parts = fen.trim().split(/\s+/);
  return { whiteToMove: parts[1] !== 'b', fullmove: Number(parts[5]) || 1 };
}
