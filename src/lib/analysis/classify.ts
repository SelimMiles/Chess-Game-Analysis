import type { GameMove } from '../chess/game';
import { isEscape } from '../chess/tactics';
import type { PositionEval } from '../engine/types';
import { moveAccuracy } from './accuracy';
import { positionCp, positionWinPercent, scoreToCp, winPercent } from './score';

export type Classification =
  | 'book'
  | 'forced'
  | 'best'
  | 'great'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export const CLASSIFICATIONS: readonly Classification[] = [
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'forced',
  'inaccuracy',
  'mistake',
  'blunder',
];

/** Win-percentage points a move may give away before it gets each label (like Chess.com's expected points). */
export const THRESHOLDS = {
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
} as const;

/** A "great" move is the only good one: the next-best move would give away this much. */
export const GREAT_GAP = 20;

export interface MoveReview {
  classification: Classification;
  /** Mover's win % before the move, assuming best play. */
  winBefore: number;
  /** Mover's win % after the move that was played. */
  winAfter: number;
  /** Win % given away (never negative). */
  winLoss: number;
  /** Centipawns given away, capped like Lichess (never negative). */
  cpLoss: number;
  /** Accuracy of this move, 0–100. */
  accuracy: number;
  /** Engine's preferred move in the position before, in UCI. */
  bestMove?: string;
  isBest: boolean;
}

export interface ClassifyInput {
  move: GameMove;
  before: PositionEval;
  after: PositionEval;
  /** The move stays in known opening theory. */
  isBook: boolean;
  /** The opponent's previous move, used to spot simple recaptures. */
  previous?: GameMove;
}

const forMover = (whiteValue: number, color: 'white' | 'black', full: number) =>
  color === 'white' ? whiteValue : full - whiteValue;

export function classifyMove({ move, before, after, isBook, previous }: ClassifyInput): MoveReview | undefined {
  const whiteBefore = positionWinPercent(before);
  const whiteAfter = positionWinPercent(after);
  const whiteCpBefore = positionCp(before);
  const whiteCpAfter = positionCp(after);
  if (whiteBefore === undefined || whiteAfter === undefined || whiteCpBefore === undefined || whiteCpAfter === undefined) {
    return undefined;
  }

  const sign = move.color === 'white' ? 1 : -1;
  const winBefore = forMover(whiteBefore, move.color, 100);
  const cpBefore = whiteCpBefore * sign;
  let winAfter = forMover(whiteAfter, move.color, 100);
  let cpAfter = whiteCpAfter * sign;

  const bestMove = before.lines[0]?.pv[0];
  const isBest = bestMove !== undefined && bestMove === move.uci;
  const second = before.lines[1];
  // Engine evaluations jitter between neighbouring positions, especially at
  // modest depths. Be lenient: the engine's own top move never loses anything,
  // and its runner-up is judged by the better of the two searches.
  if (isBest) {
    winAfter = Math.max(winAfter, winBefore);
    cpAfter = Math.max(cpAfter, cpBefore);
  } else if (second && second.pv[0] === move.uci) {
    const secondCp = scoreToCp(second.score) * sign;
    winAfter = Math.max(winAfter, forMover(winPercent(scoreToCp(second.score)), move.color, 100));
    cpAfter = Math.max(cpAfter, secondCp);
  }

  const winLoss = Math.max(0, winBefore - winAfter);
  const cpLoss = Math.max(0, cpBefore - cpAfter);
  const base = { winBefore, winAfter, winLoss, cpLoss, accuracy: moveAccuracy(winBefore, winAfter), bestMove, isBest };

  if (move.legalMoves === 1) return { ...base, classification: 'forced' };
  // Opening theory includes a few named traps (Fool's Mate is "book"). A move that
  // throws away the game is still called out, whatever the books say.
  if (isBook && winLoss < THRESHOLDS.inaccuracy) return { ...base, classification: 'book' };

  if (isBest) {
    return { ...base, classification: isGreat(move, before, winBefore, previous) ? 'great' : 'best' };
  }
  if (winLoss < THRESHOLDS.excellent) return { ...base, classification: 'excellent' };
  if (winLoss < THRESHOLDS.good) return { ...base, classification: 'good' };
  if (winLoss < THRESHOLDS.inaccuracy) return { ...base, classification: 'inaccuracy' };
  if (winLoss < THRESHOLDS.mistake) return { ...base, classification: 'mistake' };
  return { ...base, classification: 'blunder' };
}

/**
 * The engine's top move counts as "great" when every alternative would have
 * thrown away a lot, the move actually achieves something, and it is not just
 * an obvious recapture or one of very few ways out of check.
 */
function isGreat(move: GameMove, before: PositionEval, winBest: number, previous?: GameMove): boolean {
  const second = before.lines[1];
  if (!second) return false;
  // Delivering mate is simply the best move.
  if (move.san.endsWith('#')) return false;
  const winSecond = forMover(winPercent(scoreToCp(second.score)), move.color, 100);
  const gap = winBest - winSecond;
  if (gap < GREAT_GAP) return false;
  if (winSecond > 75 || winBest < 30) return false;
  const recapture = move.capture && previous?.capture && previous.to === move.to;
  if (recapture) return false;
  if (previous?.check && move.legalMoves <= 3) return false;
  if (isEscape(move)) return false;
  return true;
}

export interface ReviewSummary {
  counts: Record<'white' | 'black', Record<Classification, number>>;
  acpl: Record<'white' | 'black', number | undefined>;
}

export function summarize(moves: readonly GameMove[], reviews: readonly (MoveReview | undefined)[]): ReviewSummary {
  const empty = () => Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<Classification, number>;
  const counts = { white: empty(), black: empty() };
  const losses: Record<'white' | 'black', number[]> = { white: [], black: [] };
  moves.forEach((m, i) => {
    const r = reviews[i];
    if (!r) return;
    counts[m.color][r.classification]++;
    losses[m.color].push(r.cpLoss);
  });
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
  return { counts, acpl: { white: avg(losses.white), black: avg(losses.black) } };
}
