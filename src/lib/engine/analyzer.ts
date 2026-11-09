import type { ParsedGame } from '../chess/game';
import { terminationOf } from '../chess/game';
import { positionFromFen } from '../chess/moves';
import { toWhiteScore } from '../analysis/score';
import { UciEngine, type SearchResult } from './engine';
import type { PositionEval } from './types';
import type { UciInfo } from './uci';

export function toPositionEval(fen: string, lines: readonly UciInfo[]): PositionEval {
  const turn = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  return {
    turn,
    depth: lines[0]?.depth ?? 0,
    lines: lines.map((l) => ({ multipv: l.multipv, depth: l.depth, score: toWhiteScore(l.score, turn), pv: l.pv })),
  };
}

/** Evaluation for a position that is already over (no engine needed). */
export function terminalEval(fen: string): PositionEval | undefined {
  const pos = positionFromFen(fen);
  const terminal = terminationOf(pos);
  return terminal ? { turn: pos.turn, depth: 0, lines: [], terminal } : undefined;
}

export interface AnalyzeOptions {
  depth: number;
  /** Number of engines running in parallel. */
  threads: number;
  /** Lines per position; 2 lets us detect "only moves". */
  multiPv: number;
}

/**
 * Analyzes every position of a game with a pool of single-threaded engines.
 * Positions are independent, so several engines give a near-linear speed-up
 * without needing SharedArrayBuffer (which GitHub Pages can't enable).
 */
export class GameAnalyzer {
  private readonly engines: UciEngine[] = [];

  constructor(private readonly createEngine: () => UciEngine) {}

  private pool(size: number): UciEngine[] {
    while (this.engines.length < size) this.engines.push(this.createEngine());
    return this.engines.slice(0, size);
  }

  async analyze(
    game: ParsedGame,
    options: AnalyzeOptions,
    onResult: (index: number, ev: PositionEval) => void,
    signal: AbortSignal,
    skip: ReadonlySet<number> = new Set(),
  ): Promise<void> {
    const todo: number[] = [];
    for (let i = 0; i < game.fens.length; i++) {
      if (skip.has(i)) continue;
      const terminal = terminalEval(game.fens[i]);
      if (terminal) onResult(i, terminal);
      else todo.push(i);
    }
    if (todo.length === 0) return;

    const engines = this.pool(Math.max(1, Math.min(options.threads, todo.length)));
    await Promise.all(engines.map((e) => e.newGame()));

    let next = 0;
    const worker = async (engine: UciEngine) => {
      while (!signal.aborted) {
        const index = todo[next++];
        if (index === undefined) return;
        const result: SearchResult = await engine.search(
          {
            initialFen: game.initialFen,
            moves: game.moves.slice(0, index).map((m) => m.uci),
            depth: options.depth,
            multiPv: options.multiPv,
            chess960: game.chess960,
          },
          undefined,
          signal,
        );
        if (signal.aborted || result.aborted) return;
        onResult(index, toPositionEval(game.fens[index], result.lines));
      }
    };
    await Promise.all(engines.map(worker));
  }

  dispose(): void {
    for (const e of this.engines) e.terminate();
    this.engines.length = 0;
  }
}

export interface LiveRequest {
  initialFen: string;
  moves: string[];
  /** FEN of the position being analyzed (the result of initialFen + moves). */
  fen: string;
  multiPv: number;
  depth: number;
  chess960: boolean;
}

/**
 * Analyzes whatever position is on the board right now. Starting a new
 * request stops the previous search immediately.
 */
export class LiveAnalyzer {
  private engine: UciEngine | undefined;
  private controller: AbortController | undefined;

  constructor(private readonly createEngine: () => UciEngine) {}

  analyze(
    request: LiveRequest,
    onUpdate: (ev: PositionEval) => void,
    onDone?: (ev: PositionEval) => void,
    onError?: (error: Error) => void,
  ): void {
    this.stop();
    const terminal = terminalEval(request.fen);
    if (terminal) {
      onUpdate(terminal);
      onDone?.(terminal);
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    this.engine ??= this.createEngine();
    this.engine
      .search(
        {
          initialFen: request.initialFen,
          moves: request.moves,
          depth: request.depth,
          multiPv: request.multiPv,
          chess960: request.chess960,
        },
        (lines) => {
          if (!controller.signal.aborted) onUpdate(toPositionEval(request.fen, lines));
        },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) onDone?.(toPositionEval(request.fen, result.lines));
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) onError?.(e instanceof Error ? e : new Error(String(e)));
      });
  }

  stop(): void {
    this.controller?.abort();
    this.controller = undefined;
  }

  dispose(): void {
    this.stop();
    this.engine?.terminate();
    this.engine = undefined;
  }
}
