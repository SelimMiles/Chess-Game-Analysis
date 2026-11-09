/**
 * Accuracy, as computed by Lichess (https://lichess.org/page/accuracy).
 * Per-move accuracy comes from how much win percentage a move gives away;
 * the game score blends a volatility-weighted mean with a harmonic mean, so a
 * few big mistakes weigh more than many tiny ones.
 */

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Accuracy (0–100) of a single move, from the mover's win percentage before and after. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const diff = winBefore - winAfter;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * diff) - 3.166924740191411;
  return clamp(raw + 1, 0, 100); // +1: uncertainty bonus for imperfect analysis
}

function standardDeviation(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

export interface GameAccuracy {
  white?: number;
  black?: number;
  /** Accuracy of each move, indexed by ply - 1. */
  moves: number[];
}

/**
 * @param whiteWinPercents White's win percentage for every position, starting
 *   position included (length = number of moves + 1).
 * @param startColor Side to move in the starting position.
 * @param moveAccuracies Optional per-move accuracies to use instead of the
 *   ones derived from consecutive positions (volatility weights still come
 *   from the positions).
 */
export function gameAccuracy(
  whiteWinPercents: readonly number[],
  startColor: 'white' | 'black',
  moveAccuracies?: readonly number[],
): GameAccuracy {
  const n = whiteWinPercents.length;
  const moveCount = n - 1;
  if (moveCount < 1) return { moves: [] };

  const windowSize = clamp(Math.floor(moveCount / 10), 2, 8);
  const windows: number[][] = [];
  const first = whiteWinPercents.slice(0, windowSize);
  for (let k = 0; k < Math.min(windowSize, n) - 2; k++) windows.push(first);
  for (let i = 0; i + windowSize <= n; i++) windows.push(whiteWinPercents.slice(i, i + windowSize));
  const weights = windows.map((w) => clamp(standardDeviation(w), 0.5, 12));

  const perColor: Record<'white' | 'black', [number, number][]> = { white: [], black: [] };
  const moves: number[] = [];
  for (let i = 0; i < moveCount; i++) {
    const color = (i % 2 === 0) === (startColor === 'white') ? 'white' : 'black';
    const prev = whiteWinPercents[i];
    const next = whiteWinPercents[i + 1];
    const accuracy =
      moveAccuracies?.[i] ?? (color === 'white' ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next));
    moves.push(accuracy);
    perColor[color].push([accuracy, weights[i] ?? 0.5]);
  }

  const colorAccuracy = (items: [number, number][]): number | undefined => {
    if (items.length === 0) return undefined;
    const weightSum = items.reduce((s, [, w]) => s + w, 0);
    const weighted = items.reduce((s, [a, w]) => s + a * w, 0) / weightSum;
    const harmonic = items.length / items.reduce((s, [a]) => s + 1 / Math.max(1, a), 0);
    return (weighted + harmonic) / 2;
  };

  return { white: colorAccuracy(perColor.white), black: colorAccuracy(perColor.black), moves };
}

/** Average centipawn loss for one side (lower is better). */
export function averageCentipawnLoss(losses: readonly number[]): number | undefined {
  if (losses.length === 0) return undefined;
  return losses.reduce((a, b) => a + b, 0) / losses.length;
}
