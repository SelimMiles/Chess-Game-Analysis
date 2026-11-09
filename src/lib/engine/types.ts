import type { Termination } from '../chess/game';

/** An evaluation from White's point of view. Mate > 0: White mates in n. Mate < 0: Black mates in n. */
export type Score = { cp: number; mate?: undefined } | { mate: number; cp?: undefined };

export interface EngineLine {
  multipv: number;
  depth: number;
  score: Score;
  /** Principal variation in engine UCI notation. */
  pv: string[];
}

export interface PositionEval {
  /** Search depth reached (0 for finished positions). */
  depth: number;
  /** Best lines first. Empty when the position is already over. */
  lines: EngineLine[];
  /** Set when the position is checkmate, stalemate or a dead draw. */
  terminal?: Termination;
  /** Side to move in this position; needed to score checkmates. */
  turn: 'white' | 'black';
}
