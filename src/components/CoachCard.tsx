import { CLASSIFICATION_LABEL, explainMove, type LineText } from '../lib/analysis/explain';
import type { MoveReview } from '../lib/analysis/classify';
import { formatPositionEval } from '../lib/analysis/score';
import type { ParsedGame } from '../lib/chess/game';
import type { PositionEval } from '../lib/engine/types';
import type { Opening } from '../lib/openings/openings';
import type { AnalysisProgress } from '../state/store';
import { MoveGlyph } from './MoveGlyph';

interface Props {
  game: ParsedGame;
  ply: number;
  evals: readonly (PositionEval | undefined)[];
  reviews: readonly (MoveReview | undefined)[];
  openings: readonly (Opening | undefined)[];
  progress: AnalysisProgress;
  onPlayLine: (fen: string, uci: readonly string[], basePly: number) => void;
}

function Line({ title, line, onPlay }: { title: string; line: LineText; onPlay: () => void }) {
  return (
    <>
      <dt className="coach-line-title">{title}</dt>
      <dd>
        <button type="button" className="coach-line-moves" onClick={onPlay} title={`${line.text}. Click to play it on the board.`}>
          {line.text}
        </button>
      </dd>
    </>
  );
}

/** The coach's note on the move that was just played. */
export function CoachCard({ game, ply, evals, reviews, openings, progress, onPlayLine }: Props) {
  if (ply === 0) {
    const finalOpening = openings.filter(Boolean).at(-1);
    return (
      <section className="coach" aria-live="polite">
        <div className="coach-head">
          <h2 className="coach-title">{game.moves.length ? 'Starting position' : 'Position to analyze'}</h2>
        </div>
        <p className="coach-text">
          {game.moves.length
            ? 'Step through the game with the arrow keys, or click any move. The coach comments on every move once it has been analyzed.'
            : 'Move the pieces to try ideas; the engine evaluates each position.'}
        </p>
        {finalOpening && (
          <p className="coach-text coach-muted">
            Opening: {finalOpening.name} <span className="num">({finalOpening.eco})</span>
          </p>
        )}
      </section>
    );
  }

  const move = game.moves[ply - 1];
  const review = reviews[ply - 1];
  const before = evals[ply - 1];
  const after = evals[ply];
  const label = `${move.moveNumber}${move.color === 'white' ? '.' : '…'} ${move.san}`;

  if (!review || !before || !after) {
    const busy = progress.status === 'running' || progress.status === 'loading';
    return (
      <section className="coach" aria-live="polite">
        <div className="coach-head">
          <h2 className="coach-title">{label}</h2>
        </div>
        <p className="coach-text coach-muted">{busy ? 'Analyzing this move…' : 'This move has not been analyzed yet.'}</p>
      </section>
    );
  }

  const text = explainMove(move, review, before, after, openings[ply]?.name);
  return (
    <section className={`coach coach-${review.classification}`} aria-live="polite">
      <div className="coach-head">
        <MoveGlyph classification={review.classification} size={30} className="coach-glyph" />
        <div className="coach-heading">
          <h2 className="coach-title">{text.headline}</h2>
          <p className="coach-sub">
            <span className={`t-${review.classification}`}>{CLASSIFICATION_LABEL[review.classification]}</span>
            <span className="coach-evals num">
              {formatPositionEval(before)} <span aria-hidden="true">▸</span>
              <span className="sr-only">to</span> {formatPositionEval(after)}
            </span>
          </p>
        </div>
      </div>
      {text.details.length > 0 && <p className="coach-text">{text.details.join(' ')}</p>}
      {(text.bestLine || text.replyLine) && (
        <dl className="coach-lines">
          {text.bestLine && (
            <Line title="Best" line={text.bestLine} onPlay={() => onPlayLine(move.fenBefore, text.bestLine!.uci, ply - 1)} />
          )}
          {text.replyLine && (
            <Line
              title={['inaccuracy', 'mistake', 'blunder'].includes(review.classification) ? 'Refutation' : 'Then'}
              line={text.replyLine}
              onPlay={() => onPlayLine(move.fenAfter, text.replyLine!.uci, ply)}
            />
          )}
        </dl>
      )}
    </section>
  );
}
