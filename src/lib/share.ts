import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

/**
 * Share links carry the whole PGN in the URL fragment (compressed), so they
 * work on a static site with no server and the game never leaves the browser
 * until the person shares the link themselves.
 */

export type SharedInput = { kind: 'pgn'; pgn: string } | { kind: 'lichess'; id: string } | { kind: 'fen'; fen: string };

export function shareUrl(pgn: string, ply?: number, base = location.href): string {
  const url = new URL(base);
  url.search = '';
  const params = new URLSearchParams();
  params.set('pgn', compressToEncodedURIComponent(pgn));
  if (ply !== undefined && ply > 0) params.set('ply', String(ply));
  url.hash = params.toString();
  return url.toString();
}

/** Reads a game from the current URL: #pgn=…, #fen=…, ?lichess=<id> or #lichess=<id>. */
export function readSharedInput(href = location.href): { input?: SharedInput; ply?: number } {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const plyRaw = Number(hash.get('ply') ?? url.searchParams.get('ply'));
  const ply = Number.isInteger(plyRaw) && plyRaw > 0 ? plyRaw : undefined;

  const packed = hash.get('pgn');
  if (packed) {
    const pgn = decompressFromEncodedURIComponent(packed);
    if (pgn) return { input: { kind: 'pgn', pgn }, ply };
  }
  const fen = hash.get('fen') ?? url.searchParams.get('fen');
  if (fen) return { input: { kind: 'fen', fen }, ply };
  const lichess = hash.get('lichess') ?? url.searchParams.get('lichess');
  if (lichess && /^[A-Za-z0-9]{8,12}$/.test(lichess)) return { input: { kind: 'lichess', id: lichess.slice(0, 8) }, ply };
  return {};
}

/** Removes share parameters from the address bar without reloading. */
export function clearSharedInput(): void {
  try {
    const url = new URL(location.href);
    url.hash = '';
    url.search = '';
    history.replaceState(null, '', url.toString());
  } catch {
    /* ignore */
  }
}
