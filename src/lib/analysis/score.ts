import type { PositionEval, Score } from '../engine/types';
import type { UciInfo } from '../engine/uci';

/** Evaluations are capped at ±10 pawns; mates count as the cap (same as Lichess). */
export const CP_CEILING = 1000;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Converts an engine score (side to move's view) into White's point of view. */
export function toWhiteScore(score: UciInfo['score'], turn: 'white' | 'black'): Score {
  const sign = turn === 'white' ? 1 : -1;
  if ('mate' in score) {
    // "mate 0" means the side to move is already mated.
    const mate = score.mate === 0 ? -1 : score.mate;
    return { mate: mate * sign };
  }
  return { cp: score.cp * sign };
}

export function scoreToCp(score: Score): number {
  if (score.mate !== undefined) return score.mate > 0 ? CP_CEILING : -CP_CEILING;
  return clamp(score.cp, -CP_CEILING, CP_CEILING);
}

/** White-POV centipawns for a position, capped. Finished positions are decided exactly. */
export function positionCp(ev: PositionEval): number | undefined {
  if (ev.terminal === 'checkmate') return ev.turn === 'white' ? -CP_CEILING : CP_CEILING;
  if (ev.terminal) return 0;
  const best = ev.lines[0];
  return best ? scoreToCp(best.score) : undefined;
}

/**
 * Lichess's model of how often a position with this evaluation is won, as a
 * number between -1 (Black wins) and 1 (White wins).
 */
export function winningChances(cp: number): number {
  const MULTIPLIER = -0.00368208;
  return clamp(2 / (1 + Math.exp(MULTIPLIER * clamp(cp, -CP_CEILING, CP_CEILING))) - 1, -1, 1);
}

/** Win percentage (0–100) for White, from centipawns. */
export function winPercent(cp: number): number {
  return 50 + 50 * winningChances(cp);
}

/** White's win percentage in a position, or undefined if it is not analyzed yet. */
export function positionWinPercent(ev: PositionEval | undefined): number | undefined {
  if (!ev) return undefined;
  if (ev.terminal === 'checkmate') return ev.turn === 'white' ? 0 : 100;
  if (ev.terminal) return 50;
  const cp = positionCp(ev);
  return cp === undefined ? undefined : winPercent(cp);
}

/** "+1.25", "−0.40", "M3", "−M2". */
export function formatScore(score: Score): string {
  if (score.mate !== undefined) return `${score.mate < 0 ? '−' : ''}M${Math.abs(score.mate)}`;
  const pawns = score.cp / 100;
  if (Math.abs(pawns) < 0.005) return '0.00';
  return `${pawns > 0 ? '+' : '−'}${Math.abs(pawns).toFixed(2)}`;
}

/** Short form for tight spaces such as the eval bar: "+1.3", "M3". */
export function formatScoreShort(score: Score): string {
  if (score.mate !== undefined) return `M${Math.abs(score.mate)}`;
  const pawns = Math.abs(score.cp / 100);
  return pawns >= 10 ? pawns.toFixed(0) : pawns.toFixed(1);
}

/** Display text for a position's evaluation, including finished positions. */
export function formatPositionEval(ev: PositionEval | undefined): string {
  if (!ev) return '…';
  if (ev.terminal === 'checkmate') return ev.turn === 'white' ? '0-1' : '1-0';
  if (ev.terminal) return '½-½';
  const best = ev.lines[0];
  return best ? formatScore(best.score) : '…';
}
