import { CircleStop, ExternalLink, RotateCcw, Share2, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CLASSIFICATIONS, type Classification } from '../lib/analysis/classify';
import type { GameReview } from '../lib/analysis/review';
import { CLASSIFICATION_LABEL } from '../lib/analysis/explain';
import { playerName, playerRating, type Color, type ParsedGame } from '../lib/chess/game';
import type { Opening } from '../lib/openings/openings';
import type { AnalysisProgress, GameSource } from '../state/store';
import { MoveGlyph } from './MoveGlyph';

function formatDate(date?: string): string | undefined {
  if (!date) return undefined;
  const m = date.match(/^(\d{4})\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/);
  if (!m) return date;
  if (m[2] === '??') return m[1];
  const d = new Date(Number(m[1]), Number(m[2]) - 1, m[3] === '??' ? 1 : Number(m[3]));
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', ...(m[3] === '??' ? {} : { day: 'numeric' }) });
}

const SCORES: Record<string, [string, string]> = { '1-0': ['1', '0'], '0-1': ['0', '1'], '1/2-1/2': ['½', '½'] };

export function GameHeader({
  game,
  opening,
  source,
  tools,
}: {
  game: ParsedGame;
  opening?: Opening;
  source?: GameSource;
  tools?: ReactNode;
}) {
  const where = [game.headers.Event, game.headers.Site].filter((s) => s && !/^https?:/.test(s));
  const date = formatDate(game.headers.Date);
  const siteName = source?.kind === 'lichess' ? 'Lichess' : source?.kind === 'chesscom' ? 'Chess.com' : undefined;
  const scores = SCORES[game.result];
  return (
    <header className="game-head">
      <div className="game-head-top">
        <div className="game-players">
          {(['white', 'black'] as const).map((color, i) => (
            <div className="game-player" key={color}>
              <span className={`piece-dot ${color}`} aria-hidden="true" />
              <span className="game-player-name">{playerName(game, color)}</span>
              {playerRating(game, color) && <span className="game-rating num">{playerRating(game, color)}</span>}
              {scores && <span className="game-score num">{scores[i]}</span>}
            </div>
          ))}
        </div>
        {tools}
      </div>
      <p className="game-meta">
        {[where[0], date].filter(Boolean).join(', ') || (game.result === '*' ? 'Game in progress' : '')}
        {source?.url && siteName && (
          <a className="game-link" href={source.url} target="_blank" rel="noreferrer">
            View on {siteName} <ExternalLink size={13} aria-hidden="true" />
          </a>
        )}
      </p>
      {opening && (
        <p className="game-opening">
          {opening.name} <span className="num">{opening.eco}</span>
        </p>
      )}
    </header>
  );
}

export interface MenuAction {
  label: string;
  icon: ReactNode;
  run: () => void;
}

/** "Share & export" button with a small menu of actions. */
export function GameMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className="btn btn-small"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Share2 size={14} aria-hidden="true" /> Share
      </button>
      {open && (
        <ul className="menu-list" id={id}>
          {actions.map((a) => (
            <li key={a.label}>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  a.run();
                }}
              >
                {a.icon}
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProgressPanel({
  progress,
  onCancel,
  onRetry,
}: {
  progress: AnalysisProgress;
  onCancel: () => void;
  onRetry: () => void;
}) {
  if (progress.status === 'error') {
    return (
      <div className="progress is-error" role="alert">
        <TriangleAlert size={18} aria-hidden="true" />
        <p>{progress.error ?? 'The analysis stopped.'}</p>
        <button type="button" className="btn btn-small" onClick={onRetry}>
          <RotateCcw size={14} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }
  if (progress.status === 'idle' && progress.done < progress.total) {
    return (
      <div className="progress">
        <p>
          Analysis paused at {progress.done} of {progress.total} positions.
        </p>
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Resume
        </button>
      </div>
    );
  }
  if (progress.status !== 'running' && progress.status !== 'loading') return null;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress-text">
        <p>
          {progress.status === 'loading' ? 'Starting the engine…' : `Analyzing at depth ${progress.depth}`}
        </p>
        <span className="num">
          {progress.done} / {progress.total}
        </span>
      </div>
      <div
        className="progress-bar"
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <button type="button" className="btn btn-quiet btn-small progress-cancel" onClick={onCancel}>
        <CircleStop size={14} aria-hidden="true" /> Stop
      </button>
    </div>
  );
}

const REPORT_ORDER: Classification[] = ['great', 'best', 'excellent', 'good', 'book', 'forced', 'inaccuracy', 'mistake', 'blunder'];

export function Summary({
  game,
  review,
  onJump,
}: {
  game: ParsedGame;
  review?: GameReview;
  onJump: (c: Classification, color: Color) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!review || game.moves.length === 0) return null;
  const acc = review.accuracy;
  const fmt = (x?: number) => (x === undefined ? '…' : x.toFixed(1));
  const counts = review.summary.counts;
  return (
    <section className="summary" aria-label="Game report">
      <div className="summary-row">
        <div className="acc">
          <span className="acc-label">
            <span className="piece-dot white" aria-hidden="true" /> {playerName(game, 'white')}
          </span>
          <span className="acc-value">{fmt(acc?.white)}</span>
        </div>
        <div className="acc">
          <span className="acc-label">
            <span className="piece-dot black" aria-hidden="true" /> {playerName(game, 'black')}
          </span>
          <span className="acc-value">{fmt(acc?.black)}</span>
        </div>
        <button
          type="button"
          className="btn btn-quiet btn-small summary-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide report' : 'Full report'}
        </button>
      </div>
      <p className="summary-caption">Accuracy, from 0 to 100</p>
      {open && (
        <table className="report">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Label</span>
              </th>
              <th scope="col">White</th>
              <th scope="col">Black</th>
            </tr>
          </thead>
          <tbody>
            {REPORT_ORDER.filter((c) => CLASSIFICATIONS.includes(c)).map((c) => (
              <tr key={c}>
                <th scope="row">
                  <MoveGlyph classification={c} size={16} label={null} /> {CLASSIFICATION_LABEL[c]}
                </th>
                {(['white', 'black'] as const).map((color) => (
                  <td key={color} className="num">
                    {counts[color][c] > 0 && ['inaccuracy', 'mistake', 'blunder', 'great'].includes(c) ? (
                      <button type="button" className="link-btn" onClick={() => onJump(c, color)}>
                        {counts[color][c]}
                      </button>
                    ) : (
                      counts[color][c]
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="report-acpl">
              <th scope="row">Average centipawn loss</th>
              <td className="num">{review.summary.acpl.white?.toFixed(0) ?? '…'}</td>
              <td className="num">{review.summary.acpl.black?.toFixed(0) ?? '…'}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
