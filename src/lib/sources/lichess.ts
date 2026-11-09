import { fetchOrThrow, SourceError, validateUsername, type RemoteGame, type RemotePlayer } from './types';

const API = 'https://lichess.org';

interface LichessPlayer {
  user?: { name: string; id: string };
  rating?: number;
  aiLevel?: number;
}

/** Shape of one game in Lichess's NDJSON export (only the fields we use). */
export interface LichessGameJson {
  id: string;
  rated?: boolean;
  variant?: string;
  speed?: string;
  createdAt?: number;
  lastMoveAt?: number;
  status?: string;
  winner?: 'white' | 'black';
  players: { white: LichessPlayer; black: LichessPlayer };
  opening?: { eco?: string; name?: string };
  pgn?: string;
}

const UNFINISHED = new Set(['created', 'started', 'aborted', 'noStart']);

function player(p: LichessPlayer): RemotePlayer {
  if (p.user) return { name: p.user.name, rating: p.rating };
  if (p.aiLevel) return { name: `Stockfish level ${p.aiLevel}` };
  return { name: 'Anonymous', rating: p.rating };
}

export function fromLichessJson(g: LichessGameJson): RemoteGame {
  const result: RemoteGame['result'] =
    g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : g.status && !UNFINISHED.has(g.status) ? '1/2-1/2' : '*';
  return {
    source: 'lichess',
    id: g.id,
    url: `${API}/${g.id}`,
    pgn: g.pgn ?? '',
    white: player(g.players.white),
    black: player(g.players.black),
    result,
    playedAt: g.lastMoveAt ?? g.createdAt,
    speed: g.speed,
    rated: g.rated,
    opening: g.opening?.name,
    variant: g.variant ?? 'standard',
  };
}

export function parseNdjson<T>(text: string): T[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

/** Recent games of a Lichess user, newest first. */
export async function fetchLichessGames(username: string, max = 30, signal?: AbortSignal): Promise<RemoteGame[]> {
  const name = validateUsername(username);
  const url = `${API}/api/games/user/${encodeURIComponent(name)}?max=${max}&pgnInJson=true&clocks=true&opening=true`;
  const res = await fetchOrThrow(
    url,
    { headers: { Accept: 'application/x-ndjson' }, signal },
    'Lichess',
    `No Lichess player called “${name}”.`,
  );
  let games: LichessGameJson[];
  try {
    games = parseNdjson<LichessGameJson>(await res.text());
  } catch {
    throw new SourceError('Lichess sent an unexpected response.', 'bad-response');
  }
  return games.map(fromLichessJson).filter((g) => g.pgn);
}

/**
 * Extracts a Lichess game id from a link such as https://lichess.org/abcdEFGH,
 * https://lichess.org/abcdEFGH/black#12 or a 12-character player link.
 */
export function parseLichessGameId(input: string): string | undefined {
  const s = input.trim();
  const fromUrl = s.match(/lichess\.org\/(?:embed\/)?(?:game\/)?(?:export\/)?([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?=$|[/?#\s])/);
  if (fromUrl) return fromUrl[1];
  const bare = s.match(/^([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?$/);
  return bare ? bare[1] : undefined;
}

/** Downloads one Lichess game as PGN (with clock times). */
export async function fetchLichessGame(id: string, signal?: AbortSignal): Promise<string> {
  const res = await fetchOrThrow(
    `${API}/game/export/${encodeURIComponent(id)}?clocks=true&evals=false`,
    { headers: { Accept: 'application/x-chess-pgn' }, signal },
    'Lichess',
    'That Lichess game doesn’t exist (or is private).',
  );
  return res.text();
}
