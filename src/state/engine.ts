import { GameAnalyzer, LiveAnalyzer } from '../lib/engine/analyzer';
import { UciEngine, workerTransport } from '../lib/engine/engine';

/** Engines are created on first use and reused for every game. */
let analyzer: GameAnalyzer | undefined;
let live: LiveAnalyzer | undefined;

export function gameAnalyzer(): GameAnalyzer {
  analyzer ??= new GameAnalyzer(() => new UciEngine(workerTransport(), 16));
  return analyzer;
}

export function liveAnalyzer(): LiveAnalyzer {
  live ??= new LiveAnalyzer(() => new UciEngine(workerTransport(), 32));
  return live;
}

/** Drops all engines (used after a crash so the next request starts fresh ones). */
export function resetEngines(): void {
  analyzer?.dispose();
  live?.dispose();
  analyzer = undefined;
  live = undefined;
}
