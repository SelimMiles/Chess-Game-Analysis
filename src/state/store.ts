import type { Key } from 'chessground/types';
import { create } from 'zustand';
import { reviewGame, type GameReview } from '../lib/analysis/review';
import { parseSingleGame, playerName, type Color, type ParsedGame } from '../lib/chess/game';
import { fromEngineUci, displaySquares, positionFromFen, toEngineUci } from '../lib/chess/moves';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { opposite, parseSquare } from 'chessops/util';
import type { SquareName } from 'chessops/types';
import type { PositionEval } from '../lib/engine/types';
import { loadOpeningBook, type Opening } from '../lib/openings/openings';
import { playMoveSound, type MoveSound } from '../lib/sound';
import {
  addToHistory,
  clearHistory as clearStoredHistory,
  loadAnalysis,
  loadHistory,
  removeFromHistory,
  saveAnalysis,
  type HistoryEntry,
} from '../lib/storage';
import { gameAnalyzer, liveAnalyzer, resetEngines } from './engine';
import { boardPosition, type Explore, type ExploreMove } from './position';
import { DEPTHS, LIVE_DEPTH, loadSettings, saveSettings, type Settings } from './settings';

export type SourceKind = 'paste' | 'lichess' | 'chesscom' | 'sample' | 'shared' | 'history';

export interface GameSource {
  kind: SourceKind;
  /** Link to the game on its site. */
  url?: string;
  /** Username the game was loaded for, to orient the board. */
  username?: string;
}

export interface AnalysisProgress {
  status: 'idle' | 'loading' | 'running' | 'done' | 'error';
  done: number;
  total: number;
  depth: number;
  error?: string;
}

export interface LiveState {
  key: string;
  eval: PositionEval;
  done: boolean;
}

export interface AppState {
  view: 'home' | 'analysis';
  game?: ParsedGame;
  source?: GameSource;
  ply: number;
  orientation: Color;
  evals: (PositionEval | undefined)[];
  review?: GameReview;
  openings: (Opening | undefined)[];
  bookPlies: number;
  progress: AnalysisProgress;
  explore?: Explore;
  live?: LiveState;
  settings: Settings;
  history: HistoryEntry[];
  toast?: { id: number; text: string };
}

const initialSettings = loadSettings();

export const useStore = create<AppState>(() => ({
  view: 'home',
  ply: 0,
  orientation: 'white',
  evals: [],
  openings: [],
  bookPlies: 0,
  progress: { status: 'idle', done: 0, total: 0, depth: DEPTHS[initialSettings.depth].depth },
  settings: initialSettings,
  history: [],
}));

const get = useStore.getState;
const set = useStore.setState;

let analysisController: AbortController | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

// ————— helpers —————

function soundFor(m: { capture: boolean; check: boolean; castle: boolean }): MoveSound {
  if (m.check) return 'check';
  if (m.capture) return 'capture';
  if (m.castle) return 'castle';
  return 'move';
}

function maybeSound(m: { capture: boolean; check: boolean; castle: boolean } | undefined): void {
  if (m && get().settings.sound) playMoveSound(soundFor(m));
}

function countDone(evals: readonly (PositionEval | undefined)[]): number {
  return evals.reduce((n, e) => n + (e ? 1 : 0), 0);
}

export function notify(text: string): void {
  clearTimeout(toastTimer);
  set({ toast: { id: Date.now(), text } });
  toastTimer = setTimeout(() => set({ toast: undefined }), 2800);
}

function historyEntry(game: ParsedGame, source?: GameSource): HistoryEntry {
  return {
    id: game.id,
    white: playerName(game, 'white'),
    black: playerName(game, 'black'),
    result: game.result,
    date: game.headers.Date,
    event: game.headers.Event,
    moves: game.moves.length,
    pgn: game.pgn,
    openedAt: Date.now(),
    source: source?.url,
  };
}

// ————— opening a game —————

export interface OpenOptions {
  ply?: number;
  orientation?: Color;
}

export function openGame(game: ParsedGame, source: GameSource, options: OpenOptions = {}): void {
  analysisController?.abort();
  liveAnalyzer().stop();

  let orientation: Color = options.orientation ?? 'white';
  if (!options.orientation && source.username) {
    const u = source.username.toLowerCase();
    if (playerName(game, 'black').toLowerCase() === u) orientation = 'black';
  }
  const ply = Math.max(0, Math.min(options.ply ?? 0, game.moves.length));
  const evals = new Array<PositionEval | undefined>(game.fens.length).fill(undefined);
  set({
    view: 'analysis',
    game,
    source,
    ply,
    orientation,
    evals,
    review: reviewGame(game, evals, 0),
    openings: [],
    bookPlies: 0,
    explore: undefined,
    live: undefined,
    progress: { status: 'idle', done: 0, total: game.fens.length, depth: DEPTHS[get().settings.depth].depth },
  });

  void loadOpeningBook()
    .then((book) => {
      if (get().game !== game) return;
      const bookPlies = game.standardStart ? book.bookPlies(game.fens) : 0;
      set({
        openings: game.standardStart ? book.openingsAlong(game.fens) : [],
        bookPlies,
        review: reviewGame(game, get().evals, bookPlies),
      });
    })
    .catch(() => undefined);

  void addToHistory(historyEntry(game, source)).then((history) => history.length && set({ history }));

  window.scrollTo({ top: 0 });
  if (game.moves.length > 0) void startAnalysis();
  else refreshLive();
}

/** Parses PGN text and opens the first game in it. Returns an error message on failure. */
export function openPgn(text: string, source: GameSource, options?: OpenOptions): string | undefined {
  try {
    openGame(parseSingleGame(text), source, options);
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}

export function goHome(): void {
  analysisController?.abort();
  liveAnalyzer().stop();
  set({ view: 'home', explore: undefined, live: undefined });
  window.scrollTo({ top: 0 });
}

// ————— game analysis —————

export async function startAnalysis(): Promise<void> {
  const { game, settings } = get();
  if (!game) return;
  analysisController?.abort();
  liveAnalyzer().stop();
  const controller = new AbortController();
  analysisController = controller;
  const depth = DEPTHS[settings.depth].depth;
  const total = game.fens.length;
  const stale = () => controller.signal.aborted || get().game !== game;

  set({ progress: { status: 'loading', done: 0, total, depth }, live: undefined });
  const cached = await loadAnalysis(game.id, depth);
  if (stale()) return;
  if (cached && cached.length === total && cached.every(Boolean)) {
    set({
      evals: cached,
      review: reviewGame(game, cached, get().bookPlies),
      progress: { status: 'done', done: total, total, depth },
    });
    finishAnalysis(game);
    return;
  }

  // Keep evaluations we already have for this game (e.g. after a cancelled run at the same depth).
  const start = get().evals.map((e) => (e && (e.terminal || e.depth >= depth) ? e : undefined));
  set({ evals: start, progress: { status: 'running', done: countDone(start), total, depth } });
  const skip = new Set(start.flatMap((e, i) => (e ? [i] : [])));

  try {
    await gameAnalyzer().analyze(
      game,
      { depth, threads: settings.threads, multiPv: 2 },
      (index, ev) => {
        if (stale()) return;
        const evals = get().evals.slice();
        evals[index] = ev;
        set({
          evals,
          review: reviewGame(game, evals, get().bookPlies),
          progress: { status: 'running', done: countDone(evals), total, depth },
        });
      },
      controller.signal,
      skip,
    );
  } catch (e) {
    if (stale()) return;
    resetEngines();
    set({
      progress: {
        status: 'error',
        done: countDone(get().evals),
        total,
        depth,
        error: (e as Error).message,
      },
    });
    return;
  }
  if (stale()) return;
  set({ progress: { status: 'done', done: total, total, depth } });
  void saveAnalysis(game.id, depth, get().evals);
  finishAnalysis(game);
}

function finishAnalysis(game: ParsedGame): void {
  const accuracy = get().review?.accuracy;
  if (accuracy) {
    void addToHistory({ ...historyEntry(game, get().source), accuracy: { white: accuracy.white, black: accuracy.black } }).then(
      (history) => history.length && set({ history }),
    );
  }
  refreshLive();
}

export function cancelAnalysis(): void {
  analysisController?.abort();
  const p = get().progress;
  set({ progress: { ...p, status: 'idle' } });
  refreshLive();
}

// ————— live engine —————

let liveTimer: ReturnType<typeof setTimeout> | undefined;

/** (Re)starts live analysis of the position on the board, when it should run. */
export function refreshLive(): void {
  const { game, ply, explore, settings, progress } = get();
  clearTimeout(liveTimer);
  liveTimer = undefined;
  const busy = progress.status === 'running' || progress.status === 'loading';
  if (!game || !settings.liveEngine || busy || get().view !== 'analysis') {
    liveAnalyzer().stop();
    if (get().live) set({ live: undefined });
    return;
  }
  const pos = boardPosition(game, ply, explore);
  const key = `${pos.key}|${settings.lines}`;
  if (get().live?.key === key) return;
  set({ live: undefined });

  let pending: PositionEval | undefined;
  liveAnalyzer().analyze(
    {
      initialFen: game.initialFen,
      moves: pos.uciMoves,
      fen: pos.fen,
      multiPv: settings.lines,
      depth: LIVE_DEPTH,
      chess960: game.chess960,
    },
    (ev) => {
      pending = ev;
      liveTimer ??= setTimeout(() => {
        liveTimer = undefined;
        if (pending && currentKey() === key) set({ live: { key, eval: pending, done: false } });
      }, 120);
    },
    (ev) => {
      clearTimeout(liveTimer);
      liveTimer = undefined;
      if (currentKey() === key) set({ live: { key, eval: ev, done: true } });
    },
    () => {
      resetEngines();
      notify('The live engine stopped. It will restart on the next move.');
    },
  );
}

function currentKey(): string | undefined {
  const { game, ply, explore, settings } = get();
  return game ? `${boardPosition(game, ply, explore).key}|${settings.lines}` : undefined;
}

// ————— navigation —————

export function goTo(ply: number, sound = true): void {
  const { game, explore } = get();
  if (!game) return;
  const target = Math.max(0, Math.min(ply, game.moves.length));
  if (target === get().ply && !explore) return;
  set({ ply: target, explore: undefined });
  if (sound && target > 0) maybeSound(game.moves[target - 1]);
  refreshLive();
}

export function stepForward(): void {
  const { explore, ply } = get();
  if (explore) {
    if (explore.index < explore.moves.length) {
      set({ explore: { ...explore, index: explore.index + 1 } });
      maybeSound(explore.moves[explore.index]);
      refreshLive();
    }
    return;
  }
  goTo(ply + 1);
}

export function stepBack(): void {
  const { explore, ply } = get();
  if (explore) {
    if (explore.index > 0) {
      set({ explore: { ...explore, index: explore.index - 1 } });
      refreshLive();
    } else exitExplore();
    return;
  }
  goTo(ply - 1);
}

export function goFirst(): void {
  goTo(0, false);
}

export function goLast(): void {
  const { game } = get();
  if (game) goTo(game.moves.length, false);
}

export function flipBoard(): void {
  set({ orientation: get().orientation === 'white' ? 'black' : 'white' });
}

export function exitExplore(): void {
  const { explore } = get();
  if (!explore) return;
  set({ explore: undefined, ply: explore.basePly });
  refreshLive();
}

/** Jumps to the next move matching the labels (optionally only one side's), wrapping around. */
export function nextWithLabel(labels: readonly string[], color?: Color): boolean {
  const { game, review, ply, explore } = get();
  if (!game || !review) return false;
  const n = game.moves.length;
  const from = explore ? explore.basePly : ply;
  for (let step = 1; step <= n; step++) {
    const target = ((from - 1 + step + n) % n) + 1;
    const r = review.reviews[target - 1];
    const m = game.moves[target - 1];
    if (r && labels.includes(r.classification) && (!color || m.color === color)) {
      goTo(target);
      return true;
    }
  }
  return false;
}

export function nextMistake(color?: Color): boolean {
  const found = nextWithLabel(['inaccuracy', 'mistake', 'blunder'], color);
  if (!found) notify(get().progress.status === 'done' ? 'No mistakes found in this game.' : 'No mistakes found yet.');
  return found;
}

/** A move played on the board: follow the game if it matches, otherwise explore a side line. */
export function playBoardMove(orig: Key, dest: Key): void {
  const { game, ply, explore } = get();
  if (!game) return;
  const pos = boardPosition(game, ply, explore);
  const chess = positionFromFen(pos.fen);
  const piece = chess.board.get(parseSquare(orig as SquareName));
  // Pawns reaching the last rank become queens.
  const promoting = piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1');
  const move = fromEngineUci(chess, `${orig}${dest}${promoting ? 'q' : ''}`);
  if (!move) return;

  const uci = toEngineUci(chess, move, game.chess960);
  const capture = chess.board[opposite(chess.turn)].has(move.to) || (piece?.role === 'pawn' && orig[0] !== dest[0]);
  const castle = piece?.role === 'king' && chess.board[chess.turn].has(move.to);
  const san = makeSan(chess, move);
  const [from, to] = displaySquares(chess, move);
  chess.play(move);
  const played: ExploreMove = { san, uci, from, to, fen: makeFen(chess.toSetup()), capture, check: chess.isCheck(), castle };

  if (!explore) {
    const next = game.moves[ply];
    if (next && next.uci === uci) {
      goTo(ply + 1);
      return;
    }
    set({ explore: { basePly: ply, moves: [played], index: 1 } });
  } else {
    const next = explore.moves[explore.index];
    if (next && next.uci === uci) {
      set({ explore: { ...explore, index: explore.index + 1 } });
    } else {
      set({ explore: { ...explore, moves: [...explore.moves.slice(0, explore.index), played], index: explore.index + 1 } });
    }
  }
  maybeSound(played);
  refreshLive();
}

function exploreMoves(fen: string, uciMoves: readonly string[]): ExploreMove[] {
  const chess = positionFromFen(fen);
  const moves: ExploreMove[] = [];
  for (const uci of uciMoves) {
    const move = fromEngineUci(chess, uci);
    if (!move) break;
    const capture =
      chess.board[opposite(chess.turn)].has(move.to) || (chess.board.pawn.has(move.from) && chess.epSquare === move.to);
    const castle = chess.board.king.has(move.from) && chess.board[chess.turn].has(move.to);
    const san = makeSan(chess, move);
    const [from, to] = displaySquares(chess, move);
    chess.play(move);
    moves.push({ san, uci, from, to, fen: makeFen(chess.toSetup()), capture, check: chess.isCheck(), castle });
  }
  return moves;
}

/** Plays an engine line starting from the main-line position at `basePly`, as a side line. */
export function playLine(fen: string, uciMoves: readonly string[], basePly: number): void {
  if (!get().game) return;
  const moves = exploreMoves(fen, uciMoves);
  if (moves.length === 0) return;
  set({ ply: basePly, explore: { basePly, moves, index: 1 } });
  maybeSound(moves[0]);
  refreshLive();
}

/** Plays an engine line from whatever position is on the board (main line or side line). */
export function playLineHere(uciMoves: readonly string[]): void {
  const { game, ply, explore } = get();
  if (!game) return;
  const pos = boardPosition(game, ply, explore);
  const moves = exploreMoves(pos.fen, uciMoves);
  if (moves.length === 0) return;
  if (explore) {
    set({ explore: { ...explore, moves: [...explore.moves.slice(0, explore.index), ...moves], index: explore.index + 1 } });
  } else {
    set({ explore: { basePly: ply, moves, index: 1 } });
  }
  maybeSound(moves[0]);
  refreshLive();
}

// ————— settings & history —————

export function updateSettings(patch: Partial<Settings>): void {
  const before = get().settings;
  const settings = { ...before, ...patch };
  set({ settings });
  saveSettings(settings);
  const { game, progress } = get();
  if (game && game.moves.length > 0 && patch.depth && patch.depth !== before.depth) {
    void startAnalysis();
    return;
  }
  if (game && patch.threads && patch.threads !== before.threads && progress.status === 'running') {
    void startAnalysis();
    return;
  }
  if ('liveEngine' in patch || 'lines' in patch) refreshLive();
}

export async function initHistory(): Promise<void> {
  set({ history: await loadHistory() });
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  set({ history: await removeFromHistory(id) });
}

export async function clearHistory(): Promise<void> {
  await clearStoredHistory();
  set({ history: [] });
}
