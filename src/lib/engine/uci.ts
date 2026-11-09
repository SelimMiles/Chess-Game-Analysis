/** One `info` line from a UCI engine, with the score from the side to move's point of view. */
export interface UciInfo {
  depth: number;
  seldepth?: number;
  multipv: number;
  score: { cp: number } | { mate: number };
  bound?: 'lower' | 'upper';
  nodes?: number;
  nps?: number;
  time?: number;
  pv: string[];
}

// Tokens that are followed by exactly one value we don't use.
const SKIP_ONE = new Set(['currmove', 'currmovenumber', 'hashfull', 'tbhits', 'sbhits', 'cpuload', 'refutation']);

/** Parses a UCI `info` line. Returns null for lines without a score (e.g. `info string`, `currmove`). */
export function parseInfoLine(line: string): UciInfo | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return null;
  let depth: number | undefined;
  let score: UciInfo['score'] | undefined;
  const info: Partial<UciInfo> & { pv: string[]; multipv: number } = { multipv: 1, pv: [] };

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t) {
      case 'string':
        return null;
      case 'depth':
        depth = Number(tokens[++i]);
        break;
      case 'seldepth':
        info.seldepth = Number(tokens[++i]);
        break;
      case 'multipv':
        info.multipv = Number(tokens[++i]);
        break;
      case 'nodes':
        info.nodes = Number(tokens[++i]);
        break;
      case 'nps':
        info.nps = Number(tokens[++i]);
        break;
      case 'time':
        info.time = Number(tokens[++i]);
        break;
      case 'score': {
        const kind = tokens[++i];
        const value = Number(tokens[++i]);
        if (kind === 'cp') score = { cp: value };
        else if (kind === 'mate') score = { mate: value };
        if (tokens[i + 1] === 'lowerbound') {
          info.bound = 'lower';
          i++;
        } else if (tokens[i + 1] === 'upperbound') {
          info.bound = 'upper';
          i++;
        }
        break;
      }
      case 'wdl':
        i += 3;
        break;
      case 'pv':
        info.pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
      default:
        if (SKIP_ONE.has(t)) i++;
    }
  }
  if (depth === undefined || Number.isNaN(depth) || !score) return null;
  if ('cp' in score ? Number.isNaN(score.cp) : Number.isNaN(score.mate)) return null;
  return { ...info, depth, score } as UciInfo;
}

/** Parses `bestmove e2e4 ponder e7e5`. Returns undefined if the line is not a bestmove line. */
export function parseBestMove(line: string): { bestmove: string | null } | undefined {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'bestmove') return undefined;
  const move = tokens[1];
  return { bestmove: move && move !== '(none)' && move !== '0000' ? move : null };
}

/**
 * Keeps the most useful line for each multipv slot while a search runs.
 * Bound (aspiration window) lines only replace a slot when they are deeper.
 */
export class LineCollector {
  private readonly slots = new Map<number, UciInfo>();

  add(info: UciInfo): boolean {
    if (info.pv.length === 0) return false;
    const existing = this.slots.get(info.multipv);
    if (existing && info.bound && existing.depth >= info.depth) return false;
    if (existing && existing.depth > info.depth) return false;
    this.slots.set(info.multipv, info);
    return true;
  }

  /** Lines sorted by multipv. */
  lines(): UciInfo[] {
    return [...this.slots.values()].sort((a, b) => a.multipv - b.multipv);
  }

  get depth(): number {
    return this.slots.get(1)?.depth ?? 0;
  }

  clear(): void {
    this.slots.clear();
  }
}
