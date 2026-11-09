import type { Color, ParsedGame } from './game';

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** Material balance from White's point of view (pawn = 1, knight/bishop = 3, rook = 5, queen = 9). */
export function materialBalance(fen: string): number {
  let balance = 0;
  for (const ch of fen.split(' ')[0]) {
    const v = VALUES[ch.toLowerCase()];
    if (v) balance += ch === ch.toUpperCase() ? v : -v;
  }
  return balance;
}

/** Seconds left on a player's clock at a given ply, if the PGN recorded clock times. */
export function clockAt(game: ParsedGame, color: Color, ply: number): number | undefined {
  for (let i = Math.min(ply, game.moves.length) - 1; i >= 0; i--) {
    const m = game.moves[i];
    if (m.color === color && m.clock !== undefined) return m.clock;
  }
  // Before a player's first move, show their first recorded time.
  return game.moves.find((m) => m.color === color && m.clock !== undefined)?.clock;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 10) return s.toFixed(1);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
