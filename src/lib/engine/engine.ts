import { LineCollector, parseBestMove, parseInfoLine, type UciInfo } from './uci';

/** How the engine is reached. In the app this is a Web Worker; tests use a fake. */
export interface EngineTransport {
  post(command: string): void;
  onLine(listener: (line: string) => void): void;
  onError(listener: (error: Error) => void): void;
  terminate(): void;
}

export const ENGINE_FILE = 'engine/stockfish-19-lite-single.js';

/** Starts Stockfish in a Web Worker. The .wasm file must sit next to the .js file. */
export function workerTransport(url = new URL(ENGINE_FILE, document.baseURI).href): EngineTransport {
  const worker = new Worker(url);
  return {
    post: (command) => worker.postMessage(command),
    onLine: (listener) => {
      worker.addEventListener('message', (e: MessageEvent) => {
        for (const line of String(e.data).split('\n')) if (line) listener(line);
      });
    },
    onError: (listener) => {
      worker.addEventListener('error', (e) => {
        e.preventDefault();
        listener(new Error(e.message || 'The chess engine failed to load.'));
      });
    },
    terminate: () => worker.terminate(),
  };
}

export interface SearchRequest {
  /** FEN the game started from. */
  initialFen: string;
  /** Moves played since `initialFen`, in engine UCI. Sent so the engine knows about repetitions. */
  moves: readonly string[];
  depth?: number;
  movetime?: number;
  multiPv: number;
  chess960?: boolean;
}

export interface SearchResult {
  lines: UciInfo[];
  bestmove: string | null;
  aborted: boolean;
}

export class EngineError extends Error {}

/**
 * A small UCI client. Searches run one at a time in the order they are requested;
 * aborting a search sends `stop` and resolves it with whatever was found so far.
 */
export class UciEngine {
  private readonly handlers = new Set<(line: string) => void>();
  private readonly initPromise: Promise<void>;
  private chain: Promise<unknown>;
  private failure: Error | undefined;
  private readonly errorWaiters = new Set<(e: Error) => void>();
  private multiPv = 1;
  private chess960 = false;

  constructor(
    private readonly transport: EngineTransport,
    hashMb = 16,
  ) {
    transport.onLine((line) => {
      for (const handler of [...this.handlers]) handler(line);
    });
    transport.onError((error) => {
      this.failure = new EngineError(`The chess engine crashed (${error.message}). Reload the page to try again.`);
      for (const reject of [...this.errorWaiters]) reject(this.failure);
    });
    this.initPromise = this.init(hashMb).catch((e: unknown) => {
      this.failure ??= e instanceof EngineError ? e : new EngineError(String(e));
      throw this.failure;
    });
    this.chain = this.initPromise.catch(() => undefined);
  }

  private waitFor(
    match: (line: string) => boolean,
    timeoutMs = 60_000,
    timeoutMessage = 'The chess engine stopped responding. Reload the page to try again.',
  ): Promise<string> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        this.handlers.delete(handler);
        this.errorWaiters.delete(onError);
      };
      const handler = (line: string) => {
        if (match(line)) {
          done();
          resolve(line);
        }
      };
      const onError = (e: Error) => {
        done();
        reject(e);
      };
      const timer = setTimeout(() => {
        done();
        reject(new EngineError(timeoutMessage));
      }, timeoutMs);
      this.handlers.add(handler);
      this.errorWaiters.add(onError);
    });
  }

  private async init(hashMb: number): Promise<void> {
    const uciok = this.waitFor(
      (l) => l === 'uciok',
      30_000,
      "The chess engine didn't start. Check your connection, then reload the page.",
    );
    this.transport.post('uci');
    await uciok;
    this.transport.post(`setoption name Hash value ${hashMb}`);
    await this.isReady();
  }

  private async isReady(): Promise<void> {
    const ready = this.waitFor((l) => l === 'readyok');
    this.transport.post('isready');
    await ready;
  }

  /** Resolves once the engine has started (or rejects if it could not). */
  ready(): Promise<void> {
    return this.enqueue(async () => undefined);
  }

  /** Runs tasks one after another, after the engine has started. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      await this.initPromise;
      if (this.failure) throw this.failure;
      return task();
    };
    const next = this.chain.then(run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Tells the engine a new, unrelated game starts (clears its hash table). */
  newGame(): Promise<void> {
    return this.enqueue(async () => {
      this.transport.post('ucinewgame');
      await this.isReady();
    });
  }

  search(request: SearchRequest, onInfo?: (lines: UciInfo[]) => void, signal?: AbortSignal): Promise<SearchResult> {
    return this.enqueue(async () => {
      if (signal?.aborted) return { lines: [], bestmove: null, aborted: true };

      const chess960 = request.chess960 ?? false;
      if (request.multiPv !== this.multiPv) {
        this.transport.post(`setoption name MultiPV value ${request.multiPv}`);
        this.multiPv = request.multiPv;
      }
      if (chess960 !== this.chess960) {
        this.transport.post(`setoption name UCI_Chess960 value ${chess960}`);
        this.chess960 = chess960;
      }

      const collector = new LineCollector();
      const position = `position fen ${request.initialFen}${request.moves.length ? ` moves ${request.moves.join(' ')}` : ''}`;
      const limit = request.depth ? `depth ${request.depth}` : `movetime ${request.movetime ?? 1000}`;

      let aborted = false;
      const onAbort = () => {
        aborted = true;
        this.transport.post('stop');
      };
      const collect = (line: string) => {
        const info = parseInfoLine(line);
        if (info && collector.add(info)) onInfo?.(collector.lines());
      };
      this.handlers.add(collect);
      const best = this.waitFor((l) => l.startsWith('bestmove'), 10 * 60_000);
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        this.transport.post(position);
        this.transport.post(`go ${limit}`);
        const line = await best;
        return { lines: collector.lines(), bestmove: parseBestMove(line)?.bestmove ?? null, aborted };
      } finally {
        signal?.removeEventListener('abort', onAbort);
        this.handlers.delete(collect);
      }
    });
  }

  terminate(): void {
    this.transport.post('quit');
    this.transport.terminate();
    this.failure ??= new EngineError('Engine terminated.');
    for (const reject of [...this.errorWaiters]) reject(this.failure);
  }
}
