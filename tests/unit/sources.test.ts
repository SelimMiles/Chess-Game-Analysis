import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchChessComGames, fromChessComJson, openingFromEcoUrl } from '../../src/lib/sources/chesscom';
import { fetchLichessGames, fromLichessJson, parseLichessGameId } from '../../src/lib/sources/lichess';
import { validateUsername } from '../../src/lib/sources/types';
import { readSharedInput, shareUrl } from '../../src/lib/share';

const lichessGame = {
  id: 'q7ZvsdUF',
  rated: true,
  variant: 'standard',
  speed: 'blitz',
  createdAt: 1700000000000,
  lastMoveAt: 1700000300000,
  status: 'resign',
  winner: 'black',
  players: {
    white: { user: { name: 'Alice', id: 'alice' }, rating: 1820 },
    black: { aiLevel: 4 },
  },
  opening: { eco: 'B20', name: 'Sicilian Defense' },
  pgn: '[Event "Rated blitz game"]\n\n1. e4 c5 0-1',
};

const chessComGame = {
  url: 'https://www.chess.com/game/live/123',
  uuid: 'abc-123',
  pgn: '[Event "Live Chess"]\n\n1. d4 d5 1/2-1/2',
  end_time: 1700000400,
  rated: true,
  time_class: 'rapid',
  rules: 'chess',
  eco: 'https://www.chess.com/openings/Queens-Gambit-Declined-2...e6',
  white: { username: 'Bob', rating: 1500, result: 'agreed' },
  black: { username: 'Carol', rating: 1510, result: 'agreed' },
};

afterEach(() => vi.unstubAllGlobals());

describe('Lichess', () => {
  it('maps the API format', () => {
    const g = fromLichessJson(lichessGame as never);
    expect(g).toMatchObject({
      source: 'lichess',
      url: 'https://lichess.org/q7ZvsdUF',
      white: { name: 'Alice', rating: 1820 },
      black: { name: 'Stockfish level 4' },
      result: '0-1',
      speed: 'blitz',
      opening: 'Sicilian Defense',
      playedAt: 1700000300000,
    });
    expect(fromLichessJson({ ...lichessGame, winner: undefined, status: 'draw' } as never).result).toBe('1/2-1/2');
    expect(fromLichessJson({ ...lichessGame, winner: undefined, status: 'started' } as never).result).toBe('*');
  });

  it('fetches NDJSON games', async () => {
    const fetchMock = vi.fn(async () => new Response(`${JSON.stringify(lichessGame)}\n${JSON.stringify(lichessGame)}\n`));
    vi.stubGlobal('fetch', fetchMock);
    const games = await fetchLichessGames('Alice', 2);
    expect(games).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/games/user/Alice?max=2&pgnInJson=true');
    expect((init.headers as Record<string, string>).Accept).toBe('application/x-ndjson');
  });

  it('turns HTTP errors into friendly messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(fetchLichessGames('nobody_here')).rejects.toThrow('No Lichess player called “nobody_here”.');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    await expect(fetchLichessGames('busy')).rejects.toThrow(/rate-limiting/);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(fetchLichessGames('offline')).rejects.toThrow(/Couldn't reach Lichess/);
  });

  it('extracts game ids from links', () => {
    expect(parseLichessGameId('https://lichess.org/q7ZvsdUF')).toBe('q7ZvsdUF');
    expect(parseLichessGameId('https://lichess.org/q7ZvsdUF/black#24')).toBe('q7ZvsdUF');
    expect(parseLichessGameId('lichess.org/q7ZvsdUFabcd')).toBe('q7ZvsdUF');
    expect(parseLichessGameId('q7ZvsdUF')).toBe('q7ZvsdUF');
    expect(parseLichessGameId('https://lichess.org/@/someone')).toBeUndefined();
    expect(parseLichessGameId('1. e4 e5')).toBeUndefined();
  });
});

describe('Chess.com', () => {
  it('maps the API format', () => {
    const g = fromChessComJson(chessComGame);
    expect(g).toMatchObject({
      source: 'chesscom',
      white: { name: 'Bob', rating: 1500 },
      result: '1/2-1/2',
      playedAt: 1700000400000,
      speed: 'rapid',
      opening: 'Queens Gambit Declined',
    });
    expect(openingFromEcoUrl('https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Be3')).toBe(
      'Sicilian Defense Najdorf Variation',
    );
  });

  it('reads the newest monthly archives first', async () => {
    const months: Record<string, unknown> = {
      'https://api.chess.com/pub/player/bob/games/archives': {
        archives: [
          'https://api.chess.com/pub/player/bob/games/2026/09',
          'https://api.chess.com/pub/player/bob/games/2026/10',
          'https://evil.example/steal',
        ],
      },
      'https://api.chess.com/pub/player/bob/games/2026/10': {
        games: [chessComGame, { ...chessComGame, uuid: 'newer', end_time: 1700000900 }],
      },
      'https://api.chess.com/pub/player/bob/games/2026/09': { games: [{ ...chessComGame, uuid: 'old', end_time: 1600000000 }] },
    };
    const fetchMock = vi.fn(async (url: string) =>
      months[url] ? new Response(JSON.stringify(months[url])) : new Response('', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const games = await fetchChessComGames('Bob', 2);
    expect(games.map((g) => g.id)).toEqual(['newer', 'abc-123']);
    expect(fetchMock.mock.calls.map((c) => c[0])).not.toContain('https://evil.example/steal');
  });
});

describe('usernames and share links', () => {
  it('validates usernames', () => {
    expect(validateUsername(' @Magnus_C ')).toBe('Magnus_C');
    expect(() => validateUsername('a')).toThrow();
    expect(() => validateUsername('bad name')).toThrow();
  });

  it('round-trips a PGN through a share link', () => {
    const pgn = '[White "A"]\n\n1. e4 e5 2. Nf3 *';
    const url = shareUrl(pgn, 3, 'https://me.github.io/blunderscope/?x=1');
    expect(url.startsWith('https://me.github.io/blunderscope/#pgn=')).toBe(true);
    expect(readSharedInput(url)).toEqual({ input: { kind: 'pgn', pgn }, ply: 3 });
    expect(readSharedInput('https://x.io/?lichess=q7ZvsdUF').input).toEqual({ kind: 'lichess', id: 'q7ZvsdUF' });
    expect(readSharedInput('https://x.io/').input).toBeUndefined();
  });
});
