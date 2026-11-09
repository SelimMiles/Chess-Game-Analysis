import type { ParsedGame } from '../chess/game';
import type { PositionEval } from '../engine/types';
import { gameAccuracy, type GameAccuracy } from './accuracy';
import { classifyMove, summarize, type MoveReview, type ReviewSummary } from './classify';
import { positionWinPercent } from './score';

export interface GameReview {
  /** Review of each move, indexed by ply - 1. Undefined until both positions are analyzed. */
  reviews: (MoveReview | undefined)[];
  /** Available once every position has been analyzed. */
  accuracy?: GameAccuracy;
  summary: ReviewSummary;
  complete: boolean;
}

/**
 * @param bookPlies How many plies from the start stay in opening theory.
 */
export function reviewGame(game: ParsedGame, evals: readonly (PositionEval | undefined)[], bookPlies: number): GameReview {
  const reviews = game.moves.map((move, i) => {
    const before = evals[i];
    const after = evals[i + 1];
    if (!before || !after) return undefined;
    return classifyMove({ move, before, after, isBook: move.ply <= bookPlies, previous: game.moves[i - 1] });
  });

  const wins = game.fens.map((_, i) => positionWinPercent(evals[i]));
  const complete = wins.every((w) => w !== undefined);
  const startColor = game.initialFen.split(' ')[1] === 'b' ? 'black' : 'white';
  const moveAccuracies = reviews.map((r) => r?.accuracy);
  const accuracy =
    complete && game.moves.length > 0 && moveAccuracies.every((a) => a !== undefined)
      ? gameAccuracy(wins as number[], startColor, moveAccuracies as number[])
      : undefined;

  return { reviews, accuracy, summary: summarize(game.moves, reviews), complete };
}
