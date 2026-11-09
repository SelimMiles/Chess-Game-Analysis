import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { PositionEval } from './engine/types';

/**
 * Everything is stored in the browser (IndexedDB). Nothing leaves the device.
 * All functions swallow storage errors (private windows, full disks) because
 * saving is a convenience, never a requirement.
 */

const ANALYSIS_VERSION = 2;
const HISTORY_LIMIT = 60;

let store: UseStore | undefined;
const db = () => (store ??= createStore('blunderscope', 'kv'));

interface StoredAnalysis {
  version: number;
  depth: number;
  evals: (PositionEval | null)[];
}

export interface HistoryEntry {
  id: string;
  white: string;
  black: string;
  result: string;
  date?: string;
  event?: string;
  moves: number;
  pgn: string;
  /** When the analysis was last opened, ms since 1970. */
  openedAt: number;
  accuracy?: { white?: number; black?: number };
  source?: string;
}

export async function loadAnalysis(gameId: string, minDepth: number): Promise<(PositionEval | undefined)[] | undefined> {
  try {
    const data = await get<StoredAnalysis>(`analysis:${gameId}`, db());
    if (!data || data.version !== ANALYSIS_VERSION || data.depth < minDepth) return undefined;
    return data.evals.map((e) => e ?? undefined);
  } catch {
    return undefined;
  }
}

export async function saveAnalysis(gameId: string, depth: number, evals: readonly (PositionEval | undefined)[]): Promise<void> {
  try {
    const existing = await get<StoredAnalysis>(`analysis:${gameId}`, db());
    if (existing && existing.version === ANALYSIS_VERSION && existing.depth > depth) return;
    await set(`analysis:${gameId}`, { version: ANALYSIS_VERSION, depth, evals: evals.map((e) => e ?? null) }, db());
  } catch {
    /* storage is optional */
  }
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    return (await get<HistoryEntry[]>('history', db())) ?? [];
  } catch {
    return [];
  }
}

export async function addToHistory(entry: HistoryEntry): Promise<HistoryEntry[]> {
  try {
    const all = await loadHistory();
    const previous = all.find((e) => e.id === entry.id);
    const list = all.filter((e) => e.id !== entry.id);
    const merged = { ...previous, ...entry, accuracy: entry.accuracy ?? previous?.accuracy };
    const next = [merged, ...list].slice(0, HISTORY_LIMIT);
    for (const dropped of list.slice(HISTORY_LIMIT - 1)) await del(`analysis:${dropped.id}`, db());
    await set('history', next, db());
    return next;
  } catch {
    return [];
  }
}

export async function removeFromHistory(id: string): Promise<HistoryEntry[]> {
  try {
    const next = (await loadHistory()).filter((e) => e.id !== id);
    await set('history', next, db());
    await del(`analysis:${id}`, db());
    return next;
  } catch {
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  try {
    for (const e of await loadHistory()) await del(`analysis:${e.id}`, db());
    await set('history', [], db());
  } catch {
    /* ignore */
  }
}

/** Small synchronous settings live in localStorage. */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`blunderscope:${key}`);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(`blunderscope:${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
