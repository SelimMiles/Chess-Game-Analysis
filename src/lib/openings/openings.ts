import openingsUrl from '../../data/openings.json?url';
import { cyrb53, epdOf } from './hash';

export interface Opening {
  eco: string;
  name: string;
}

export interface OpeningData {
  book: string[];
  named: Record<string, [string, string]>;
}

/** Lookup of opening theory positions, built from the Lichess opening dataset (CC0). */
export class OpeningBook {
  private readonly book: Set<string>;
  private readonly named: Map<string, Opening>;

  constructor(data: OpeningData) {
    this.book = new Set(data.book);
    this.named = new Map(Object.entries(data.named).map(([k, [eco, name]]) => [k, { eco, name }]));
  }

  /** True when the position occurs in a known opening line. */
  isBook(fen: string): boolean {
    return this.book.has(cyrb53(epdOf(fen)));
  }

  /** The opening named after exactly this position, if any. */
  nameOf(fen: string): Opening | undefined {
    return this.named.get(cyrb53(epdOf(fen)));
  }

  /**
   * For each ply, the opening reached so far (the deepest named position up to that ply).
   * Index i corresponds to fens[i].
   */
  openingsAlong(fens: readonly string[]): (Opening | undefined)[] {
    let current: Opening | undefined;
    return fens.map((fen, i) => {
      if (i > 0) current = this.nameOf(fen) ?? current;
      return current;
    });
  }

  /**
   * Number of plies, from the start, that stay in opening theory. Transpositions count,
   * but once a move leaves theory the opening phase is over.
   */
  bookPlies(fens: readonly string[]): number {
    let n = 0;
    for (let i = 1; i < fens.length; i++) {
      if (!this.isBook(fens[i])) break;
      n = i;
    }
    return n;
  }
}

let loading: Promise<OpeningBook> | undefined;

/** Loads the opening data lazily (~120 kB gzipped), as a separate cached file. */
export function loadOpeningBook(): Promise<OpeningBook> {
  loading ??= fetch(openingsUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`Opening data unavailable (${res.status})`);
      return res.json() as Promise<OpeningData>;
    })
    .then((data) => new OpeningBook(data))
    .catch((e: unknown) => {
      loading = undefined;
      throw e;
    });
  return loading;
}
