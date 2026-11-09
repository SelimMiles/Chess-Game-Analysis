/**
 * cyrb53: a fast, well-distributed 53-bit string hash (public domain, by bryc).
 * Returned in base 36 to keep stored keys short.
 * Must stay identical to the copy in scripts/build-openings.mjs.
 */
export function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The first four FEN fields (board, turn, castling, en passant) identify a position. */
export function epdOf(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}
