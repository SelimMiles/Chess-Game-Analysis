import { describe, expect, it, vi } from 'vitest';
import { UciEngine, type EngineTransport } from '../../src/lib/engine/engine';

/** A scripted engine: answers uci/isready, and replies to `go` after a tick (or on `stop`). */
class FakeTransport implements EngineTransport {
  sent: string[] = [];
  private lineListeners: ((l: string) => void)[] = [];
  private errorListeners: ((e: Error) => void)[] = [];
  private pending: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly delay = 5) {}

  post(cmd: string) {
    this.sent.push(cmd);
    const emit = (l: string) => this.lineListeners.forEach((fn) => fn(l));
    if (cmd === 'uci') queueMicrotask(() => emit('uciok'));
    if (cmd === 'isready') queueMicrotask(() => emit('readyok'));
    if (cmd.startsWith('go')) {
      queueMicrotask(() => emit('info depth 5 multipv 1 score cp 31 pv e2e4 e7e5'));
      this.pending = setTimeout(() => {
        emit('info depth 6 multipv 1 score cp 28 pv d2d4');
        emit('bestmove d2d4');
      }, this.delay);
    }
    if (cmd === 'stop' && this.pending) {
      clearTimeout(this.pending);
      this.pending = undefined;
      queueMicrotask(() => emit('bestmove e2e4'));
    }
  }
  onLine(fn: (l: string) => void) {
    this.lineListeners.push(fn);
  }
  onError(fn: (e: Error) => void) {
    this.errorListeners.push(fn);
  }
  fail(message: string) {
    this.errorListeners.forEach((fn) => fn(new Error(message)));
  }
  terminate() {}
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('UciEngine', () => {
  it('initializes, then searches with the right commands', async () => {
    const t = new FakeTransport();
    const engine = new UciEngine(t, 32);
    const updates: string[] = [];
    const result = await engine.search(
      { initialFen: START, moves: ['e2e4'], depth: 12, multiPv: 2 },
      (lines) => updates.push(lines[0].pv[0]),
    );
    expect(result.bestmove).toBe('d2d4');
    expect(result.lines[0].depth).toBe(6);
    expect(updates).toEqual(['e2e4', 'd2d4']);
    expect(t.sent).toEqual([
      'uci',
      'setoption name Hash value 32',
      'isready',
      'setoption name MultiPV value 2',
      `position fen ${START} moves e2e4`,
      'go depth 12',
    ]);
  });

  it('runs searches one at a time, in order', async () => {
    const t = new FakeTransport();
    const engine = new UciEngine(t);
    const order: number[] = [];
    await Promise.all([
      engine.search({ initialFen: START, moves: [], depth: 5, multiPv: 1 }).then(() => order.push(1)),
      engine.search({ initialFen: START, moves: [], depth: 5, multiPv: 1 }).then(() => order.push(2)),
    ]);
    expect(order).toEqual([1, 2]);
    expect(t.sent.filter((c) => c.startsWith('go'))).toHaveLength(2);
  });

  it('stops a search when aborted and returns partial results', async () => {
    const t = new FakeTransport(10_000);
    const engine = new UciEngine(t);
    const controller = new AbortController();
    const search = engine.search({ initialFen: START, moves: [], depth: 30, multiPv: 1 }, undefined, controller.signal);
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    const result = await search;
    expect(result.aborted).toBe(true);
    expect(result.lines[0].pv[0]).toBe('e2e4');
    expect(t.sent).toContain('stop');
  });

  it('reports engine crashes to waiting searches', async () => {
    const t = new FakeTransport(10_000);
    const engine = new UciEngine(t);
    const search = engine.search({ initialFen: START, moves: [], depth: 30, multiPv: 1 });
    await new Promise((r) => setTimeout(r, 10));
    t.fail('wasm out of memory');
    await expect(search).rejects.toThrow(/crashed \(wasm out of memory\)/);
    await expect(engine.search({ initialFen: START, moves: [], depth: 5, multiPv: 1 })).rejects.toThrow();
  });

  it('enables Chess960 only when needed', async () => {
    const t = new FakeTransport();
    const engine = new UciEngine(t);
    await engine.search({ initialFen: START, moves: [], depth: 5, multiPv: 1, chess960: true });
    await engine.search({ initialFen: START, moves: [], depth: 5, multiPv: 1, chess960: true });
    expect(t.sent.filter((c) => c.includes('UCI_Chess960'))).toEqual(['setoption name UCI_Chess960 value true']);
  });

  it('gives up with a clear message when the engine never starts', async () => {
    vi.useFakeTimers();
    try {
      const silent: EngineTransport = { post() {}, onLine() {}, onError() {}, terminate() {} };
      const engine = new UciEngine(silent);
      const ready = engine.ready();
      const check = expect(ready).rejects.toThrow("The chess engine didn't start");
      await vi.advanceTimersByTimeAsync(30_000);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });
});
