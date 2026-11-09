import type { Role } from 'chessops/types';
import { opposite, parseSquare } from 'chessops/util';
import type { GameMove } from './game';
import { positionFromFen } from './moves';

const VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };

/**
 * True when the move simply rescues a piece that was hanging: it was attacked
 * by something cheaper, or attacked and undefended, and the move captures nothing.
 * Such moves are often the only good move, but they are not "great".
 */
export function isEscape(move: GameMove): boolean {
  if (move.capture || move.castle) return false;
  const pos = positionFromFen(move.fenBefore);
  const from = parseSquare(move.from);
  const piece = pos.board.get(from);
  if (!piece || piece.role === 'king' || piece.role === 'pawn') return false;
  const occupied = pos.board.occupied;
  const attackers = pos.kingAttackers(from, opposite(piece.color), occupied);
  if (attackers.isEmpty()) return false;
  const defended = pos.kingAttackers(from, piece.color, occupied).nonEmpty();
  let cheapest = Infinity;
  for (const sq of attackers) cheapest = Math.min(cheapest, VALUE[pos.board.getRole(sq) ?? 'king']);
  return !defended || cheapest < VALUE[piece.role];
}
