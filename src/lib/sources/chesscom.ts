import { fetchOrThrow, SourceError, validateUsername, type RemoteGame } from './types';

const API = 'https://api.chess.com/pub';

interface ChessComPlayer {
  username: string;
  rating?: number;
  result: string;
}

/** Shape of one game in Chess.com's monthly archive (only the fields we use). */
export interface ChessComGameJson {
  url: string;
  uuid?: string;
  pgn?: string;
  end_time?: number;
  rated?: boolean;
  time_class?: string;
  rules?: string;
  eco?: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
}

const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

/** "https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Be3" → "Sicilian Defense Najdorf Variation". */
export function openingFromEcoUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const slug = url.split('/openings/')[1];
  if (!slug) return undefined;
  const name = decodeURIComponent(slug)
    .replace(/-\d.*$/, '')
    .replace(/-/g, ' ')
    .trim();
  return name || undefined;
}

export function fromChessComJson(g: ChessComGameJson): RemoteGame {
  const result: RemoteGame['result'] =
    g.white.result === 'win'
      ? '1-0'
      : g.black.result === 'win'
        ? '0-1'
        : DRAWS.has(g.white.result) || DRAWS.has(g.black.result)
          ? '1/2-1/2'
          : '*';
  return {
    source: 'chesscom',
    id: g.uuid ?? g.url,
    url: g.url,
    pgn: g.pgn ?? '',
    white: { name: g.white.username, rating: g.white.rating },
    black: { name: g.black.username, rating: g.black.rating },
    result,
    playedAt: g.end_time ? g.end_time * 1000 : undefined,
    speed: g.time_class,
    rated: g.rated,
    opening: openingFromEcoUrl(g.eco),
    variant: g.rules ?? 'chess',
  };
}

/** Recent games of a Chess.com user, newest first (reads the latest monthly archives). */
export async function fetchChessComGames(username: string, max = 30, signal?: AbortSignal): Promise<RemoteGame[]> {
  const name = validateUsername(username).toLowerCase();
  const notFound = `No Chess.com player called “${username.trim()}”.`;
  const res = await fetchOrThrow(`${API}/player/${encodeURIComponent(name)}/games/archives`, { signal }, 'Chess.com', notFound);
  let archives: string[];
  try {
    archives = (((await res.json()) as { archives?: string[] }).archives ?? []).filter((a) => a.startsWith(`${API}/`));
  } catch {
    throw new SourceError('Chess.com sent an unexpected response.', 'bad-response');
  }

  const games: RemoteGame[] = [];
  // Archives are oldest first; read backwards until we have enough games (at most 3 months).
  for (const archive of archives.slice(-3).reverse()) {
    const monthRes = await fetchOrThrow(archive, { signal }, 'Chess.com', notFound);
    const month = ((await monthRes.json()) as { games?: ChessComGameJson[] }).games ?? [];
    games.push(...month.map(fromChessComJson).filter((g) => g.pgn));
    if (games.length >= max) break;
  }
  return games.sort((a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0)).slice(0, max);
}
