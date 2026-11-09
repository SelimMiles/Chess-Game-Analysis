import { lineFrom } from '../lib/analysis/explain';
import { formatScore } from '../lib/analysis/score';
import type { PositionEval } from '../lib/engine/types';

interface Props {
  fen: string;
  ev?: PositionEval;
  /** Where the lines come from. */
  source: 'live' | 'review' | 'none';
  searching: boolean;
  liveEnabled: boolean;
  /** The game review is still running, so live analysis waits. */
  waitingForReview: boolean;
  onToggleLive: (on: boolean) => void;
  onPlayLine: (uci: readonly string[]) => void;
}

export function EngineLines({ fen, ev, source, searching, liveEnabled, waitingForReview, onToggleLive, onPlayLine }: Props) {
  const status = ev?.terminal
    ? ev.terminal === 'checkmate'
      ? 'Checkmate'
      : ev.terminal === 'stalemate'
        ? 'Stalemate'
        : 'Draw by insufficient material'
    : ev
      ? `Depth ${ev.depth}${searching ? '…' : ''}`
      : searching
        ? 'Starting…'
        : waitingForReview && liveEnabled
          ? 'Waiting for the review to finish'
          : liveEnabled
            ? ''
            : 'Off';

  return (
    <section className="engine" aria-label="Engine lines">
      <div className="engine-head">
        <h2 className="engine-title">Stockfish 19</h2>
        <span className="engine-status num">
          {status}
          {source === 'review' && ev && !ev.terminal ? ' (from the review)' : ''}
        </span>
        <label className="switch">
          <input type="checkbox" checked={liveEnabled} onChange={(e) => onToggleLive(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-label">Live</span>
        </label>
      </div>
      {ev && !ev.terminal && ev.lines.length > 0 && (
        <ol className="engine-lines">
          {ev.lines.map((l) => {
            const text = lineFrom(fen, l.pv, 12);
            if (!text) return null;
            return (
              <li key={l.multipv}>
                <button type="button" className="engine-line" onClick={() => onPlayLine(text.uci)} title="Play this line on the board">
                  <span className={`engine-score num ${(l.score.mate ?? l.score.cp ?? 0) >= 0 ? 'for-white' : 'for-black'}`}>
                    {formatScore(l.score)}
                  </span>
                  <span className="engine-pv">{text.text}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
