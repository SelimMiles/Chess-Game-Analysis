import { Keyboard, Moon, Plus, Settings, Sun } from 'lucide-react';
import { useStore } from '../state/store';
import { Logo } from './Logo';

interface Props {
  onNewGame: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onToggleTheme: () => void;
  dark: boolean;
}

export function AppHeader({ onNewGame, onOpenSettings, onOpenShortcuts, onToggleTheme, dark }: Props) {
  const view = useStore((s) => s.view);
  return (
    <header className="app-header">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <button type="button" className="brand" onClick={onNewGame} aria-label="Blunderscope home">
        <Logo />
        <span className="brand-name">Blunderscope</span>
      </button>
      <div className="app-header-actions">
        {view === 'analysis' && (
          <button type="button" className="btn btn-small" onClick={onNewGame}>
            <Plus size={15} aria-hidden="true" /> New game
          </button>
        )}
        {view === 'analysis' && (
          <button type="button" className="icon-btn hide-narrow" onClick={onOpenShortcuts} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard size={19} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={dark ? 'Use light theme' : 'Use dark theme'}
          title={dark ? 'Light theme' : 'Dark theme'}
        >
          {dark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <Settings size={19} />
        </button>
      </div>
    </header>
  );
}
