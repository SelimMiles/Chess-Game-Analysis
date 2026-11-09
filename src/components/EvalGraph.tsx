import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import type { MoveReview } from '../lib/analysis/classify';
import { CLASSIFICATION_LABEL } from '../lib/analysis/explain';
import { formatPositionEval, positionWinPercent } from '../lib/analysis/score';
import type { ParsedGame } from '../lib/chess/game';
import type { PositionEval } from '../lib/engine/types';
import { MoveGlyph } from './MoveGlyph';

interface Props {
  game: ParsedGame;
  evals: readonly (PositionEval | undefined)[];
  reviews: readonly (MoveReview | undefined)[];
  /** Highlighted ply, or undefined while exploring a side line. */
  ply?: number;
  onSelect: (ply: number) => void;
}

const HEIGHT = 100;
const TOP = 8;
const AXIS = 20;
const PAD_X = 6;
const MARKED = new Set(['great', 'inaccuracy', 'mistake', 'blunder']);

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export const moveLabel = (game: ParsedGame, ply: number) => {
  const m = game.moves[ply - 1];
  return m ? `${m.moveNumber}${m.color === 'white' ? '.' : '…'} ${m.san}` : 'Start';
};

/** White's winning chances move by move: White's share fills from below, Black's from above. */
export function EvalGraph({ game, evals, reviews, ply, onSelect }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = game.moves.length;
  if (n === 0) return null;

  const plotH = HEIGHT - TOP - AXIS;
  const bottom = TOP + plotH;
  const span = Math.max(1, width - PAD_X * 2);
  const x = (i: number) => PAD_X + (i / n) * span;
  const y = (v: number) => TOP + (1 - v / 100) * plotH;
  const wins = game.fens.map((_, i) => positionWinPercent(evals[i]));

  const segments: number[][] = [];
  let run: number[] = [];
  wins.forEach((w, i) => {
    if (w === undefined) {
      if (run.length) segments.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) segments.push(run);

  const line = segments
    .map((seg) => seg.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(wins[i]!).toFixed(1)}`).join(''))
    .join('');
  const area = segments
    .map(
      (seg) =>
        `M${x(seg[0]).toFixed(1)},${bottom}` +
        seg.map((i) => `L${x(i).toFixed(1)},${y(wins[i]!).toFixed(1)}`).join('') +
        `L${x(seg[seg.length - 1]).toFixed(1)},${bottom}Z`,
    )
    .join('');

  const startsWhite = game.moves[0]?.color === 'white';
  const ticks: { ply: number; label: string }[] = [];
  const lastMoveNumber = game.moves[n - 1].moveNumber;
  const firstMoveNumber = game.moves[0].moveNumber;
  const step = lastMoveNumber - firstMoveNumber > 60 ? 20 : 10;
  for (let m = Math.ceil(firstMoveNumber / step) * step; m <= lastMoveNumber; m += step) {
    if (m === 0) continue;
    const idx = game.moves.findIndex((mv) => mv.moveNumber === m && mv.color === 'white');
    const p = idx >= 0 ? idx + 1 : game.moves.findIndex((mv) => mv.moveNumber === m) + 1;
    if (p > 0) ticks.push({ ply: p, label: String(m) });
  }

  const nearest = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left - PAD_X) / span;
    return Math.max(0, Math.min(n, Math.round(rel * n)));
  };

  const shown = hover ?? null;
  const hoverWin = shown !== null ? wins[shown] : undefined;
  const hoverReview = shown ? reviews[shown - 1] : undefined;
  const tipLeft = shown !== null ? Math.min(Math.max(x(shown), 70), Math.max(70, width - 70)) : 0;

  return (
    <div className="graph">
      <div
        ref={ref}
        className="graph-plot"
        onPointerMove={(e) => setHover(nearest(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onSelect(nearest(e))}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label="Winning chances over the game">
            <rect x={PAD_X} y={TOP} width={span} height={plotH} className="graph-black" rx="3" />
            <path d={area} className="graph-white" />
            <line x1={PAD_X} x2={PAD_X + span} y1={y(50)} y2={y(50)} className="graph-mid" />
            <path d={line} className="graph-line" />
            {ply !== undefined && (
              <line x1={x(ply)} x2={x(ply)} y1={TOP} y2={bottom} className="graph-cursor" />
            )}
            {shown !== null && shown !== ply && (
              <line x1={x(shown)} x2={x(shown)} y1={TOP} y2={bottom} className="graph-crosshair" />
            )}
            {reviews.map((r, i) => {
              const w = wins[i + 1];
              if (!r || w === undefined || !MARKED.has(r.classification)) return null;
              return (
                <circle
                  key={i}
                  cx={x(i + 1)}
                  cy={y(w)}
                  r={4.5}
                  className="graph-dot"
                  style={{ fill: `var(--c-${r.classification})` }}
                />
              );
            })}
            {ply !== undefined && wins[ply] !== undefined && (
              <circle cx={x(ply)} cy={y(wins[ply]!)} r={4} className="graph-current" />
            )}
            {ticks.map((t) => (
              <text key={t.ply} x={x(t.ply)} y={HEIGHT - 5} className="graph-tick num" textAnchor="middle">
                {t.label}
              </text>
            ))}
          </svg>
        )}
        {shown !== null && (
          <div className="graph-tip" style={{ left: tipLeft }} aria-hidden="true">
            <strong className="num">{hoverWin === undefined ? '…' : formatPositionEval(evals[shown])}</strong>
            <span className="graph-tip-move">
              {moveLabel(game, shown)}
              {hoverReview && <MoveGlyph classification={hoverReview.classification} size={14} label={null} />}
              {hoverReview && <span>{CLASSIFICATION_LABEL[hoverReview.classification]}</span>}
            </span>
          </div>
        )}
      </div>
      <p className="graph-legend">
        <span className="legend-key legend-white" /> White better
        <span className="legend-key legend-black" /> Black better
        {startsWhite ? null : <span className="graph-note">Game starts with Black to move</span>}
      </p>
      <details className="graph-table">
        <summary>Evaluation table</summary>
        <div className="graph-table-scroll scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Move</th>
                <th scope="col">Evaluation</th>
                <th scope="col">White’s chances</th>
                <th scope="col">Label</th>
              </tr>
            </thead>
            <tbody>
              {game.moves.map((m, i) => {
                const r = reviews[i];
                const w = wins[i + 1];
                return (
                  <tr key={m.ply}>
                    <th scope="row">
                      <button type="button" className="link-btn" onClick={() => onSelect(m.ply)}>
                        {moveLabel(game, m.ply)}
                      </button>
                    </th>
                    <td className="num">{formatPositionEval(evals[i + 1])}</td>
                    <td className="num">{w === undefined ? '…' : `${Math.round(w)}%`}</td>
                    <td>{r ? CLASSIFICATION_LABEL[r.classification] : '…'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
