export type GameSource = 'lichess' | 'chesscom';

export interface RemotePlayer {
  name: string;
  rating?: number;
}

/** A game listed from Lichess or Chess.com, ready to analyze. */
export interface RemoteGame {
  source: GameSource;
  id: string;
  url: string;
  pgn: string;
  white: RemotePlayer;
  black: RemotePlayer;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  /** When the game ended (or started), in milliseconds since 1970. */
  playedAt?: number;
  /** bullet, blitz, rapid, classical, daily, correspondence… */
  speed?: string;
  rated?: boolean;
  opening?: string;
  variant: string;
}

export class SourceError extends Error {
  constructor(
    message: string,
    readonly kind: 'not-found' | 'rate-limited' | 'network' | 'bad-response' | 'invalid-input',
  ) {
    super(message);
  }
}

/** fetch() with errors turned into friendly SourceErrors. */
export async function fetchOrThrow(url: string, init: RequestInit, site: string, notFound: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new SourceError(`Couldn't reach ${site}. Check your connection and try again.`, 'network');
  }
  if (res.status === 404 || res.status === 410) throw new SourceError(notFound, 'not-found');
  if (res.status === 429) {
    throw new SourceError(`${site} is rate-limiting requests. Wait a minute and try again.`, 'rate-limited');
  }
  if (!res.ok) throw new SourceError(`${site} answered with an error (${res.status}). Try again later.`, 'bad-response');
  return res;
}

/** Usernames on both sites are 2–30 letters, digits, '_' or '-'. */
export function validateUsername(input: string): string {
  const name = input.trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(name)) {
    throw new SourceError('That doesn’t look like a valid username.', 'invalid-input');
  }
  return name;
}
