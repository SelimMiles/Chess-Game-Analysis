import type { GameMove } from '../chess/game';
import { fenTurnAndMove, formatLine, uciLineToSan } from '../chess/moves';
import type { PositionEval } from '../engine/types';
import type { Classification, MoveReview } from './classify';

export interface LineText {
  /** FEN the line starts from. */
  fen: string;
  sans: string[];
  uci: string[];
  /** Numbered text, e.g. "14. Nf3 Qd7 15. O-O". */
  text: string;
}

export interface MoveExplanation {
  headline: string;
  details: string[];
  /** What the engine wanted instead (only when the move was not the top choice). */
  bestLine?: LineText;
  /** How the engine continues after the move that was played. */
  replyLine?: LineText;
}

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  book: 'Book move',
  forced: 'Forced',
  best: 'Best move',
  great: 'Great move',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/** PGN-style glyph for each label (shown on the board and in the move list). */
export const CLASSIFICATION_GLYPH: Record<Classification, string> = {
  book: '',
  forced: '',
  best: '★',
  great: '!',
  excellent: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

const LINE_PLIES = 6;

export function lineFrom(fen: string, uci: readonly string[], max = LINE_PLIES): LineText | undefined {
  if (uci.length === 0) return undefined;
  const sans = uciLineToSan(fen, uci, max);
  if (sans.length === 0) return undefined;
  const { whiteToMove, fullmove } = fenTurnAndMove(fen);
  return { fen, sans, uci: uci.slice(0, sans.length), text: formatLine(sans, fullmove, whiteToMove) };
}

type Outlook = 'winning' | 'better' | 'equal' | 'worse' | 'losing';

function outlook(win: number): Outlook {
  if (win >= 85) return 'winning';
  if (win >= 62) return 'better';
  if (win > 38) return 'equal';
  if (win > 15) return 'worse';
  return 'losing';
}

const OUTLOOK_TEXT: Record<Outlook, string> = {
  winning: 'winning',
  better: 'better',
  equal: 'roughly equal',
  worse: 'worse',
  losing: 'losing',
};

/** Mate distance for the mover: positive = mover mates, negative = mover gets mated. */
function moverMate(ev: PositionEval, color: 'white' | 'black'): number | undefined {
  const mate = ev.lines[0]?.score.mate;
  if (mate === undefined) return undefined;
  return color === 'white' ? mate : -mate;
}

const article = (c: Classification) => (c === 'inaccuracy' || c === 'excellent' ? 'an' : 'a');

export function explainMove(
  move: GameMove,
  review: MoveReview,
  before: PositionEval,
  after: PositionEval,
  openingName?: string,
): MoveExplanation {
  const side = move.color === 'white' ? 'White' : 'Black';
  const opponent = move.color === 'white' ? 'Black' : 'White';
  const c = review.classification;
  const details: string[] = [];
  const bestLine = review.isBest ? undefined : lineFrom(move.fenBefore, before.lines[0]?.pv ?? []);
  const replyLine = after.terminal ? undefined : lineFrom(move.fenAfter, after.lines[0]?.pv ?? []);
  const bestSan = bestLine?.sans[0];

  let headline: string;
  switch (c) {
    case 'book':
      headline = `${move.san} is a book move`;
      details.push(openingName ? `It's known opening theory: ${openingName}.` : "It's known opening theory.");
      break;
    case 'forced':
      headline = `${move.san} was forced`;
      details.push('It was the only legal move.');
      break;
    case 'best':
      headline = `${move.san} is the best move`;
      break;
    case 'great': {
      headline = `${move.san} is a great move`;
      const o = outlook(review.winAfter);
      details.push(
        o === 'winning' || o === 'better'
          ? `It's the only move that keeps ${side}'s advantage.`
          : o === 'equal'
            ? 'It is the only move that holds the balance.'
            : `It's the only move that keeps ${side} in the game.`,
      );
      break;
    }
    case 'excellent':
      headline = `${move.san} is excellent`;
      if (bestSan) details.push(`Nearly as strong as the engine's top choice, ${bestSan}.`);
      break;
    case 'good':
      headline = `${move.san} is good`;
      if (bestSan) details.push(`${bestSan} was a little stronger.`);
      break;
    default: {
      headline = `${move.san} is ${article(c)} ${c}`;
      const mateBefore = moverMate(before, move.color);
      const mateAfter = after.terminal ? undefined : moverMate(after, move.color);
      if (mateAfter !== undefined && mateAfter < 0) {
        details.push(`It allows ${opponent} to force mate in ${Math.abs(mateAfter)}.`);
      } else if (mateBefore !== undefined && mateBefore > 0 && (mateAfter === undefined || mateAfter <= 0)) {
        details.push(`It misses a forced mate in ${mateBefore}.`);
      } else {
        const from = outlook(review.winBefore);
        const to = outlook(review.winAfter);
        if (from !== to) {
          details.push(`${side}'s position goes from ${OUTLOOK_TEXT[from]} to ${OUTLOOK_TEXT[to]}.`);
        } else {
          details.push(`It costs about ${(review.cpLoss / 100).toFixed(1)} pawns in evaluation.`);
        }
      }
      if (bestSan) details.push(`${bestSan} was best.`);
    }
  }
  return { headline, details, bestLine, replyLine };
}
