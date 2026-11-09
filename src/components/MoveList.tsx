import { memo, useEffect, useRef } from 'react';
import type { Classification, MoveReview } from '../lib/analysis/classify';
import { CLASSIFICATION_GLYPH, CLASSIFICATION_LABEL } from '../lib/analysis/explain';
import { formatPositionEval } from '../lib/analysis/score';
import type { GameMove, ParsedGame } from '../lib/chess/game';
import type { PositionEval } from '../lib/engine/types';

interface Props {
  game: ParsedGame;
  evals: readonly (PositionEval | undefined)[];
  reviews: readonly (MoveReview | undefined)[];
  /** Current main-line ply (also set while exploring, at the branch point). */
  ply: number;
  exploring: boolean;
  onSelect: (ply: number) => void;
}

/** Labels that earn a mark in the scoresheet margin. */
const NOTED = new Set<Classification>(['great', 'inaccuracy', 'mistake', 'blunder']);

interface Row {
  number: number;
  white?: GameMove;
  black?: GameMove;
}

function rows(moves: readonly GameMove[]): Row[] {
  const out: Row[] = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (m.color === 'white' || !last || last.number !== m.moveNumber || last.black) {
      out.push(m.color === 'white' ? { number: m.moveNumber, white: m } : { number: m.moveNumber, black: m });
    } else last.black = m;
  }
  return out;
}

function Cell({
  move,
  review,
  ev,
  current,
  onSelect,
}: {
  move?: GameMove;
  review?: MoveReview;
  ev?: PositionEval;
  current: boolean;
  onSelect: (ply: number) => void;
}) {
  if (!move) return <span className="sheet-cell is-empty" aria-hidden="true" />;
  const c = review?.classification;
  const noted = c && NOTED.has(c);
  const label = c ? `${CLASSIFICATION_LABEL[c]}. ` : '';
  return (
    <button
      type="button"
      className={`sheet-cell${current ? ' is-current' : ''}${noted ? ` is-${c}` : ''}`}
      aria-current={current ? 'step' : undefined}
      aria-label={`${move.moveNumber}${move.color === 'white' ? '.' : '...'} ${move.san}. ${label}${ev ? formatPositionEval(ev) : ''}`}
      onClick={() => onSelect(move.ply)}
      data-ply={move.ply}
    >
      <span className="sheet-san">
        {move.san}
        {noted && <span className={`sheet-glyph t-${c}`}>{CLASSIFICATION_GLYPH[c]}</span>}
      </span>
      <span className="sheet-eval num">{ev ? formatPositionEval(ev) : ''}</span>
    </button>
  );
}

/** The game as a club scoresheet: numbered rows, White and Black columns. */
export const MoveList = memo(function MoveList({ game, evals, reviews, ply, exploring, onSelect }: Props) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-ply="${ply}"]`);
    if (el && list.current) {
      const box = list.current.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.top < box.top + 4 || r.bottom > box.bottom - 4) {
        list.current.scrollTop += r.top - box.top - box.height / 2 + r.height / 2;
      }
    }
    if (ply === 0 && list.current) list.current.scrollTop = 0;
  }, [ply]);

  if (game.moves.length === 0) {
    return <p className="sheet-empty">No moves — this is a single position. Move pieces on the board to explore it.</p>;
  }

  return (
    <div className="sheet scroll" ref={list} role="list" aria-label="Moves">
      {rows(game.moves).map((row) => (
        <div className="sheet-row" role="listitem" key={`${row.number}-${row.white?.ply ?? row.black?.ply}`}>
          <span className="sheet-number num">{row.number}</span>
          {(['white', 'black'] as const).map((color) => {
            const move = row[color];
            return (
              <Cell
                key={color}
                move={move}
                review={move ? reviews[move.ply - 1] : undefined}
                ev={move ? evals[move.ply] : undefined}
                current={!!move && move.ply === ply && !exploring}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ))}
      <div className="sheet-result">{game.result === '*' ? 'Game unfinished' : game.result.replace('1/2', '½')}</div>
    </div>
  );
});
