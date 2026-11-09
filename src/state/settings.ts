import { readLocal, writeLocal } from '../lib/storage';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type BoardTheme = 'ink' | 'walnut' | 'tournament' | 'slate';
export type DepthPreset = 'fast' | 'standard' | 'deep';

export interface Settings {
  theme: ThemeSetting;
  board: BoardTheme;
  depth: DepthPreset;
  /** Number of engines analyzing a game in parallel. */
  threads: number;
  sound: boolean;
  /** Keep analyzing the position on the board after the game review is done. */
  liveEngine: boolean;
  /** Lines shown by the live engine. */
  lines: number;
  /** Arrow for the better move when a move was not the best. */
  bestArrow: boolean;
  /** Arrow for the engine's suggestion in the current position. */
  engineArrow: boolean;
  coordinates: boolean;
}

export const DEPTHS: Record<DepthPreset, { depth: number; label: string; hint: string }> = {
  fast: { depth: 12, label: 'Fast', hint: 'A quick look, a few seconds per game' },
  standard: { depth: 16, label: 'Standard', hint: 'Reliable for most games' },
  deep: { depth: 20, label: 'Deep', hint: 'Most accurate, takes a few minutes' },
};

export const LIVE_DEPTH = 22;

export const BOARD_THEMES: { id: BoardTheme; label: string; light: string; dark: string }[] = [
  { id: 'ink', label: 'Ink', light: '#e6ecf4', dark: '#8a9fbc' },
  { id: 'walnut', label: 'Walnut', light: '#ecd9b9', dark: '#b08561' },
  { id: 'tournament', label: 'Tournament', light: '#eeeedd', dark: '#6f9465' },
  { id: 'slate', label: 'Slate', light: '#dfe1e3', dark: '#868b93' },
];

const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
const touchDevice = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
export const MAX_THREADS = Math.max(1, Math.min(8, cores));

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  board: 'ink',
  depth: 'standard',
  // Phones get fewer engines by default to spare battery and memory.
  threads: Math.max(1, Math.min(touchDevice ? 2 : 4, cores - 1)),
  sound: true,
  liveEngine: true,
  lines: 3,
  bestArrow: true,
  engineArrow: false,
  coordinates: true,
};

export function loadSettings(): Settings {
  const s = readLocal<Settings>('settings', DEFAULT_SETTINGS);
  return {
    ...s,
    threads: Math.max(1, Math.min(MAX_THREADS, Math.round(s.threads) || DEFAULT_SETTINGS.threads)),
    lines: Math.max(1, Math.min(5, Math.round(s.lines) || 3)),
    depth: s.depth in DEPTHS ? s.depth : 'standard',
    board: BOARD_THEMES.some((b) => b.id === s.board) ? s.board : 'ink',
  };
}

export function saveSettings(settings: Settings): void {
  writeLocal('settings', settings);
}
