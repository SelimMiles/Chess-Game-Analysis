import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnalysisView } from './components/AnalysisView';
import { AppHeader } from './components/AppHeader';
import { SettingsDialog, ShortcutsDialog, Toast } from './components/Dialogs';
import { HomeView } from './components/home/HomeView';
import { playerName } from './lib/chess/game';
import { fetchLichessGame } from './lib/sources/lichess';
import { clearSharedInput, readSharedInput } from './lib/share';
import {
  exitExplore,
  flipBoard,
  goFirst,
  goHome,
  goLast,
  initHistory,
  nextMistake,
  notify,
  openPgn,
  stepBack,
  stepForward,
  updateSettings,
  useStore,
} from './state/store';

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      darkQuery?.addEventListener('change', cb);
      return () => darkQuery?.removeEventListener('change', cb);
    },
    () => darkQuery?.matches ?? false,
  );
}

const IN_ANALYSIS = 'blunderscope-analysis';

function leaveAnalysis() {
  if (history.state === IN_ANALYSIS) history.back();
  else goHome();
}

async function openFromUrl() {
  const { input, ply } = readSharedInput();
  if (!input) return;
  clearSharedInput();
  if (input.kind === 'pgn' || input.kind === 'fen') {
    const error = openPgn(input.kind === 'pgn' ? input.pgn : input.fen, { kind: 'shared' }, { ply });
    if (error) notify(`That link has a game that couldn't be read: ${error}`);
    return;
  }
  try {
    const pgn = await fetchLichessGame(input.id);
    const error = openPgn(pgn, { kind: 'lichess', url: `https://lichess.org/${input.id}` }, { ply });
    if (error) notify(error);
  } catch (e) {
    notify((e as Error).message);
  }
}

export function App() {
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.settings.theme);
  const game = useStore((s) => s.game);
  const systemDark = useSystemDark();
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    void initHistory();
    void openFromUrl();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1522' : '#eef2f7');
  }, [theme, dark]);

  useEffect(() => {
    document.title =
      view === 'analysis' && game ? `${playerName(game, 'white')} vs ${playerName(game, 'black')} | Blunderscope` : 'Blunderscope: chess game analysis';
  }, [view, game]);

  // The browser's back button returns from a game to the start page.
  useEffect(() => {
    if (view === 'analysis' && history.state !== IN_ANALYSIS) history.pushState(IN_ANALYSIS, '');
    const onPop = () => {
      if (useStore.getState().view === 'analysis') goHome();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [view, game]);

  useEffect(() => {
    if (view !== 'analysis') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: stepBack,
        ArrowRight: stepForward,
        ArrowUp: goFirst,
        ArrowDown: goLast,
        Home: goFirst,
        End: goLast,
        f: flipBoard,
        n: () => nextMistake(),
        l: () => updateSettings({ liveEngine: !useStore.getState().settings.liveEngine }),
        Escape: exitExplore,
        '?': () => setShortcutsOpen(true),
      };
      const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  return (
    <>
      <AppHeader
        onNewGame={leaveAnalysis}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onToggleTheme={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
        dark={dark}
      />
      {view === 'analysis' ? <AnalysisView /> : <HomeView />}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Toast />
    </>
  );
}
