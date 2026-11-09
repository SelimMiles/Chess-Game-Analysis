import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { SAMPLE_GAMES } from '../../src/data/samples';
import { reviewGame } from '../../src/lib/analysis/review';
import { parseSingleGame } from '../../src/lib/chess/game';
import { GameAnalyzer } from '../../src/lib/engine/analyzer';
import { UciEngine, type EngineTransport } from '../../src/lib/engine/engine';
import type { PositionEval } from '../../src/lib/engine/types';

/**
 * Runs the real Stockfish 19 WebAssembly build (public/engine) in a child Node
 * process, talking UCI over stdin/stdout. The engine script is CommonJS, so it is
 * copied next to its .wasm under a .cjs name (this package is "type": "module").
 */
const engineDir = mkdtempSync(join(tmpdir(), 'blunderscope-engine-'));
const engineSrc = fileURLToPath(new URL('../../public/engine/', import.meta.url));
copyFileSync(join(engineSrc, 'stockfish-19-lite-single.js'), join(engineDir, 'stockfish-19-lite-single.cjs'));
copyFileSync(join(engineSrc, 'stockfish-19-lite-single.wasm'), join(engineDir, 'stockfish-19-lite-single.wasm'));

function nodeTransport(): EngineTransport {
  const child = spawn(process.execPath, [join(engineDir, 'stockfish-19-lite-single.cjs')], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const lines = createInterface({ input: child.stdout });
  return {
    post: (cmd) => child.stdin.write(`${cmd}\n`),
    onLine: (fn) => lines.on('line', fn),
    onError: (fn) => child.on('error', fn),
    terminate: () => child.kill(),
  };
}

describe('full analysis with the real engine', () => {
  const analyzer = new GameAnalyzer(() => new UciEngine(nodeTransport()));
  afterAll(() => {
    analyzer.dispose();
    rmSync(engineDir, { recursive: true, force: true });
  });

  it('reviews the Opera Game', async () => {
    const game = parseSingleGame(SAMPLE_GAMES.find((g) => g.id === 'opera')!.pgn);
    const evals: (PositionEval | undefined)[] = [];
    await analyzer.analyze(game, { depth: 12, threads: 1, multiPv: 2 }, (i, ev) => (evals[i] = ev), new AbortController().signal);

    expect(evals.filter(Boolean)).toHaveLength(game.fens.length);
    expect(evals.at(-1)?.terminal).toBe('checkmate');
    // Before 17. Rd8# the engine sees mate in one for White.
    expect(evals[32]?.lines[0].score).toEqual({ mate: 1 });
    expect(evals[32]?.lines[0].pv[0]).toBe('d1d8');

    const review = reviewGame(game, evals, 0);
    expect(review.complete).toBe(true);
    expect(review.reviews.at(-1)?.classification).toBe('best');
    expect(review.accuracy!.white!).toBeGreaterThan(review.accuracy!.black!);
    const { inaccuracy, mistake, blunder } = review.summary.counts.black;
    expect(inaccuracy + mistake + blunder).toBeGreaterThan(0);
  }, 60_000);
});
