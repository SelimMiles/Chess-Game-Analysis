import type { RemoteGame } from '../../lib/sources/types';

function outcome(g: RemoteGame, username: string): { text: string; tone: 'win' | 'loss' | 'draw' | 'none' } {
  const u = username.toLowerCase();
  const color = g.white.name.toLowerCase() === u ? 'white' : g.black.name.toLowerCase() === u ? 'black' : undefined;
  if (g.result === '1/2-1/2') return { text: 'Draw', tone: 'draw' };
  if (g.result === '*' || !color) return { text: g.result === '*' ? 'Unfinished' : g.result, tone: 'none' };
  const won = (g.result === '1-0') === (color === 'white');
  return { text: won ? 'Won' : 'Lost', tone: won ? 'win' : 'loss' };
}

function when(ms?: number): string {
  if (!ms) return '';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: days > 300 ? 'numeric' : undefined });
}

const SPEED: Record<string, string> = {
  ultraBullet: 'UltraBullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Correspondence',
  daily: 'Daily',
};

/** Recent games of a player, newest first. Each row opens the game for analysis. */
export function RemoteGameList({
  games,
  username,
  onPick,
}: {
  games: RemoteGame[];
  username: string;
  onPick: (g: RemoteGame) => void;
}) {
  return (
    <div className="choices">
      <p className="choices-title">Recent games of {username}. Pick one to analyze.</p>
      <ul className="game-list scroll">
        {games.map((g) => {
          const o = outcome(g, username);
          const u = username.toLowerCase();
          const asWhite = g.white.name.toLowerCase() === u;
          const opponent = asWhite ? g.black : g.white;
          return (
            <li key={g.id}>
              <button type="button" className="game-row" onClick={() => onPick(g)}>
                <span className={`outcome outcome-${o.tone}`}>{o.text}</span>
                <span className="game-row-main">
                  <span className={`piece-dot ${asWhite ? 'black' : 'white'}`} aria-hidden="true" />
                  {opponent.name}
                  {opponent.rating ? <span className="game-rating num"> {opponent.rating}</span> : null}
                </span>
                <span className="game-row-meta">
                  {[SPEED[g.speed ?? ''] ?? g.speed, g.opening, when(g.playedAt)].filter(Boolean).join(', ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
