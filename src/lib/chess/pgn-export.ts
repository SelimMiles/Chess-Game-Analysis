import { ChildNode, makeComment, makePgn, Node, type Game, type PgnNodeData } from 'chessops/pgn';
import type { Classification, MoveReview } from '../analysis/classify';
import { CLASSIFICATION_LABEL, lineFrom } from '../analysis/explain';
import type { PositionEval } from '../engine/types';
import type { ParsedGame } from './game';

/** Standard PGN annotation glyphs (NAGs). */
const NAG: Partial<Record<Classification, number>> = {
  great: 1, // !
  inaccuracy: 6, // ?!
  mistake: 2, // ?
  blunder: 4, // ??
};

function evalComment(ev: PositionEval | undefined) {
  const best = ev?.lines[0];
  if (!ev || ev.terminal || !best) return undefined;
  return best.score.mate !== undefined
    ? { mate: best.score.mate, depth: best.depth }
    : { pawns: Math.round(best.score.cp) / 100, depth: best.depth };
}

export interface ExportOptions {
  annotator: string;
  accuracy?: { white?: number; black?: number };
}

/**
 * Writes the game as PGN with the analysis embedded the way Lichess does it:
 * [%eval] comments, ?! ? ?? glyphs, a short note on mistakes, and the
 * engine's better line as a variation.
 */
export function annotatedPgn(
  game: ParsedGame,
  evals: readonly (PositionEval | undefined)[],
  reviews: readonly (MoveReview | undefined)[],
  options: ExportOptions,
): string {
  const headers = new Map(Object.entries(game.headers));
  headers.set('Annotator', options.annotator);
  if (!headers.has('Result')) headers.set('Result', game.result);
  const out: Game<PgnNodeData> = { headers, moves: new Node() };
  const acc = options.accuracy;
  if (acc && (acc.white !== undefined || acc.black !== undefined)) {
    const fmt = (x?: number) => (x === undefined ? '–' : `${x.toFixed(1)}%`);
    out.comments = [`Accuracy: White ${fmt(acc.white)}, Black ${fmt(acc.black)}`];
  }

  let parent: Node<PgnNodeData> = out.moves;
  game.moves.forEach((move, i) => {
    const review = reviews[i];
    const after = evals[i + 1];
    const before = evals[i];
    const nag = review ? NAG[review.classification] : undefined;
    const bad = review && (review.classification === 'inaccuracy' || review.classification === 'mistake' || review.classification === 'blunder');

    const best = bad && before ? lineFrom(move.fenBefore, before.lines[0]?.pv ?? [], 10) : undefined;
    let text: string | undefined;
    if (bad && review) {
      text = `${CLASSIFICATION_LABEL[review.classification]}.${best ? ` ${best.sans[0]} was best.` : ''}`;
    }
    const comment = makeComment({ text, evaluation: evalComment(after), clock: move.clock });
    const node = new ChildNode<PgnNodeData>({
      san: move.san,
      nags: nag ? [nag] : undefined,
      comments: comment ? [comment] : undefined,
    });
    parent.children.push(node);

    if (best && best.sans.length > 0 && best.sans[0] !== move.san) {
      let varParent: Node<PgnNodeData> | undefined;
      for (const san of best.sans) {
        const child = new ChildNode<PgnNodeData>({ san });
        if (!varParent) parent.children.push(child);
        else varParent.children.push(child);
        varParent = child;
      }
    }
    parent = node;
  });

  return makePgn(out);
}

/** File name for a downloaded PGN, e.g. "Morphy-vs-Allies-1858.pgn". */
export function pgnFileName(game: ParsedGame): string {
  const clean = (s?: string) => (s ?? '').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
  const year = (game.headers.Date ?? '').slice(0, 4);
  const parts = [clean(game.headers.White) || 'White', 'vs', clean(game.headers.Black) || 'Black'];
  if (/^\d{4}$/.test(year)) parts.push(year);
  return `${parts.join('-')}.pgn`;
}
