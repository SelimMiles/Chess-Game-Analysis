import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { chessgroundDests } from 'chessops/compat';
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CornerUpLeft,
  Copy,
  Download,
  Link as LinkIcon,
  SkipForward,
} from 'lucide-react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatScoreShort, positionWinPercent } from '../lib/analysis/score';
import { playerName, playerRating, type Color } from '../lib/chess/game';
import { clockAt, formatClock, materialBalance } from '../lib/chess/material';
import { displaySquares, fromEngineUci, positionFromFen } from '../lib/chess/moves';
import { annotatedPgn, pgnFileName } from '../lib/chess/pgn-export';
import type { PositionEval } from '../lib/engine/types';
import { shareUrl } from '../lib/share';
import { boardPosition } from '../state/position';
import { DEPTHS } from '../state/settings';
import {
  cancelAnalysis,
  exitExplore,
  flipBoard,
  goFirst,
  goLast,
  goTo,
  nextMistake,
  nextWithLabel,
  notify,
  playBoardMove,
  playLine,
  playLineHere,
  startAnalysis,
  stepBack,
  stepForward,
  updateSettings,
  useStore,
} from '../state/store';
import { Board } from './Board';
import { CoachCard } from './CoachCard';
import { EngineLines } from './EngineLines';
import { EvalBar } from './EvalBar';
import { EvalGraph } from './EvalGraph';
import { GameHeader, GameMenu, ProgressPanel, Summary } from './GamePanels';
import { boardBadgeSvg } from './MoveGlyph';
import { MoveList } from './MoveList';

const NO_ARROW = new Set(['best', 'great', 'book', 'forced']);

function PlayerStrip({ color, fen, clock }: { color: Color; fen: string; clock?: number }) {
  const game = useStore((s) => s.game)!;
  const balance = materialBalance(fen) * (color === 'white' ? 1 : -1);
  return (
    <div className="player">
      <span className={`piece-dot ${color}`} aria-hidden="true" />
      <span className="player-name">{playerName(game, color)}</span>
      {playerRating(game, color) && <span className="player-rating num">{playerRating(game, color)}</span>}
      {balance > 0 && (
        <span className="player-material num" title="Material advantage">
          +{balance}
        </span>
      )}
      {clock !== undefined && (
        <span className="player-clock num" aria-label={`Clock ${formatClock(clock)}`}>
          {formatClock(clock)}
        </span>
      )}
    </div>
  );
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify(done);
  } catch {
    notify('Copying is blocked in this browser. Select the text and copy it by hand.');
  }
}

export function AnalysisView() {
  const { game, ply, orientation, evals, review, openings, progress, explore, live, settings, source } = useStore(
    useShallow((s) => ({
      game: s.game,
      ply: s.ply,
      orientation: s.orientation,
      evals: s.evals,
      review: s.review,
      openings: s.openings,
      progress: s.progress,
      explore: s.explore,
      live: s.live,
      settings: s.settings,
      source: s.source,
    })),
  );

  const pos = useMemo(() => (game ? boardPosition(game, ply, explore) : undefined), [game, ply, explore]);
  const dests = useMemo(() => {
    if (!pos) return new Map();
    return chessgroundDests(positionFromFen(pos.fen), { chess960: game?.chess960 }) as Map<Key, Key[]>;
  }, [pos, game?.chess960]);

  // The evaluation of the position on the board: live engine first, then the game review.
  const liveEval = live && pos && live.key.startsWith(`${pos.key}|`) ? live.eval : undefined;
  const reviewEval: PositionEval | undefined = pos?.ply !== undefined ? evals[pos.ply] : undefined;
  const boardEval = liveEval ?? reviewEval;

  const shapes = useMemo<DrawShape[]>(() => {
    if (!game || !pos) return [];
    const out: DrawShape[] = [];
    if (pos.ply !== undefined && pos.ply > 0) {
      const move = game.moves[pos.ply - 1];
      const r = review?.reviews[pos.ply - 1];
      if (r) {
        out.push({ orig: move.to as Key, customSvg: { html: boardBadgeSvg(r.classification) } });
        if (settings.bestArrow && !NO_ARROW.has(r.classification) && r.bestMove) {
          const before = positionFromFen(move.fenBefore);
          const best = fromEngineUci(before, r.bestMove);
          if (best) {
            const [from, to] = displaySquares(before, best);
            out.push({ orig: from as Key, dest: to as Key, brush: 'best' });
          }
        }
      }
    }
    const top = boardEval?.lines[0]?.pv[0];
    if (settings.engineArrow && top) {
      const chess = positionFromFen(pos.fen);
      const m = fromEngineUci(chess, top);
      if (m) {
        const [from, to] = displaySquares(chess, m);
        out.push({ orig: from as Key, dest: to as Key, brush: 'engine' });
      }
    }
    return out;
  }, [game, pos, review, settings.bestArrow, settings.engineArrow, boardEval]);

  if (!game || !pos) return null;

  const whiteWin = positionWinPercent(boardEval);
  const best = boardEval?.lines[0];
  const leader: Color = (whiteWin ?? 50) >= 50 ? 'white' : 'black';
  const barLabel = boardEval?.terminal
    ? boardEval.terminal === 'checkmate'
      ? boardEval.turn === 'white'
        ? '0-1'
        : '1-0'
      : '½'
    : best
      ? formatScoreShort(best.score)
      : undefined;

  const top: Color = orientation === 'white' ? 'black' : 'white';
  const bottom: Color = orientation;
  const clockPly = pos.ply ?? explore?.basePly ?? ply;
  const last = pos.ply !== undefined ? game.moves[pos.ply - 1] : explore?.moves[explore.index - 1];
  const boardLabel = `${last ? `Position after ${'moveNumber' in last ? `${last.moveNumber}${last.color === 'white' ? '.' : '…'} ` : ''}${last.san}` : 'Starting position'}, ${pos.turn} to move`;

  const analysisDone = progress.status === 'done';
  const pgnOut = () =>
    review && evals.some(Boolean)
      ? annotatedPgn(game, evals, review.reviews, {
          annotator: `Blunderscope (Stockfish 19, depth ${DEPTHS[settings.depth].depth})`,
          accuracy: review.accuracy,
        })
      : game.pgn;

  const download = () => {
    const blob = new Blob([pgnOut()], { type: 'application/x-chess-pgn' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = pgnFileName(game);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <main className="analysis" id="main">
      <div className="stage">
        <PlayerStrip color={top} fen={pos.fen} clock={clockAt(game, top, clockPly)} />
        <div className="board-row">
          <EvalBar whiteWin={whiteWin} label={barLabel} leader={leader} orientation={orientation} />
          <Board
            fen={pos.fen}
            orientation={orientation}
            turnColor={pos.turn}
            lastMove={pos.lastMove}
            check={pos.check}
            dests={dests}
            shapes={shapes}
            coordinates={settings.coordinates}
            theme={settings.board}
            onMove={playBoardMove}
            label={boardLabel}
          />
        </div>
        <PlayerStrip color={bottom} fen={pos.fen} clock={clockAt(game, bottom, clockPly)} />

        <nav className="controls" aria-label="Move navigation">
          <button type="button" className="icon-btn" onClick={goFirst} disabled={ply === 0 && !explore} aria-label="First move" title="First move (Home)">
            <ChevronsLeft size={20} />
          </button>
          <button type="button" className="icon-btn" onClick={stepBack} disabled={ply === 0 && !explore} aria-label="Previous move" title="Previous move (←)">
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={stepForward}
            disabled={explore ? explore.index >= explore.moves.length : ply >= game.moves.length}
            aria-label="Next move"
            title="Next move (→)"
          >
            <ChevronRight size={22} />
          </button>
          <button type="button" className="icon-btn" onClick={goLast} disabled={ply >= game.moves.length && !explore} aria-label="Last move" title="Last move (End)">
            <ChevronsRight size={20} />
          </button>
          <span className="controls-gap" />
          <button type="button" className="btn btn-small" onClick={() => nextMistake()} disabled={!review || game.moves.length === 0} title="Next mistake (N)">
            <SkipForward size={15} aria-hidden="true" /> Next mistake
          </button>
          <button type="button" className="icon-btn" onClick={flipBoard} aria-label="Flip board" title="Flip board (F)">
            <ArrowDownUp size={18} />
          </button>
        </nav>

        {explore && (
          <div className="explore" role="status">
            <div className="explore-text">
              <span className="explore-title">Side line</span>
              <span className="explore-moves">
                {explore.moves.map((m, i) => (
                  <span key={i} className={i === explore.index - 1 ? 'is-current' : i >= explore.index ? 'is-ahead' : undefined}>
                    {m.san}{' '}
                  </span>
                ))}
              </span>
            </div>
            <button type="button" className="btn btn-small" onClick={exitExplore}>
              <CornerUpLeft size={14} aria-hidden="true" /> Back to the game
            </button>
          </div>
        )}
      </div>

      <aside className="panel" aria-label="Game review">
        <GameHeader
          game={game}
          opening={openings[explore ? explore.basePly : ply] ?? openings.filter(Boolean).at(-1)}
          source={source}
          tools={
            <GameMenu
              actions={[
                { label: 'Download PGN with analysis', icon: <Download size={16} aria-hidden="true" />, run: download },
                { label: 'Copy PGN', icon: <Copy size={16} aria-hidden="true" />, run: () => void copy(pgnOut(), 'PGN copied') },
                { label: 'Copy FEN of this position', icon: <Copy size={16} aria-hidden="true" />, run: () => void copy(pos.fen, 'FEN copied') },
                {
                  label: 'Copy link to this game',
                  icon: <LinkIcon size={16} aria-hidden="true" />,
                  run: () => void copy(shareUrl(game.pgn, explore ? explore.basePly : ply), 'Link copied'),
                },
              ]}
            />
          }
        />
        <ProgressPanel progress={progress} onCancel={cancelAnalysis} onRetry={() => void startAnalysis()} />
        {game.moves.length > 0 && (
          <EvalGraph game={game} evals={evals} reviews={review?.reviews ?? []} ply={explore ? undefined : ply} onSelect={(p) => goTo(p)} />
        )}
        {analysisDone || progress.done > 0 ? (
          <Summary game={game} review={review} onJump={(c, color) => nextWithLabel([c], color)} />
        ) : null}
        <CoachCard
          game={game}
          ply={explore ? explore.basePly : ply}
          evals={evals}
          reviews={review?.reviews ?? []}
          openings={openings}
          progress={progress}
          onPlayLine={playLine}
        />
        <MoveList game={game} evals={evals} reviews={review?.reviews ?? []} ply={explore ? explore.basePly : ply} exploring={!!explore} onSelect={(p) => goTo(p)} />
        <EngineLines
          fen={pos.fen}
          ev={boardEval}
          source={liveEval ? 'live' : reviewEval ? 'review' : 'none'}
          searching={!!settings.liveEngine && !(live?.done ?? false) && !(progress.status === 'running' || progress.status === 'loading')}
          liveEnabled={settings.liveEngine}
          waitingForReview={progress.status === 'running' || progress.status === 'loading'}
          onToggleLive={(on) => updateSettings({ liveEngine: on })}
          onPlayLine={playLineHere}
        />
      </aside>
    </main>
  );
}
