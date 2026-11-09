import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { BOARD_THEMES, DEPTHS, MAX_THREADS, type DepthPreset, type ThemeSetting } from '../state/settings';
import { clearHistory, notify, updateSettings, useStore } from '../state/store';

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="check-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore((st) => st.settings);
  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      <fieldset className="set">
        <legend>Analysis depth</legend>
        <div className="radio-cards">
          {(Object.keys(DEPTHS) as DepthPreset[]).map((d) => (
            <label key={d} className="radio-card">
              <input type="radio" name="depth" checked={s.depth === d} onChange={() => updateSettings({ depth: d })} />
              <span className="radio-card-title">
                {DEPTHS[d].label} <span className="num field-hint">depth {DEPTHS[d].depth}</span>
              </span>
              <span className="field-hint">{DEPTHS[d].hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="set">
        <legend>Engine</legend>
        <div className="set-grid">
          <label className="field">
            <span className="field-label">Engines working in parallel</span>
            <select className="select" value={s.threads} onChange={(e) => updateSettings({ threads: Number(e.target.value) })}>
              {Array.from({ length: MAX_THREADS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="field-hint">More is faster but uses more battery. Your device has {MAX_THREADS} cores.</span>
          </label>
          <label className="field">
            <span className="field-label">Lines shown by the live engine</span>
            <select className="select" value={s.lines} onChange={(e) => updateSettings({ lines: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Check
          checked={s.liveEngine}
          onChange={(v) => updateSettings({ liveEngine: v })}
          label="Live engine"
          hint="Keeps analyzing the position on the board, deeper than the review."
        />
      </fieldset>

      <fieldset className="set">
        <legend>Board</legend>
        <div className="swatches" role="radiogroup" aria-label="Board colors">
          {BOARD_THEMES.map((b) => (
            <label key={b.id} className="swatch">
              <input type="radio" name="board" checked={s.board === b.id} onChange={() => updateSettings({ board: b.id })} />
              <span className="swatch-squares" aria-hidden="true">
                <span style={{ background: b.light }} />
                <span style={{ background: b.dark }} />
                <span style={{ background: b.dark }} />
                <span style={{ background: b.light }} />
              </span>
              <span className="swatch-label">{b.label}</span>
            </label>
          ))}
        </div>
        <Check checked={s.coordinates} onChange={(v) => updateSettings({ coordinates: v })} label="Show coordinates" />
        <Check
          checked={s.bestArrow}
          onChange={(v) => updateSettings({ bestArrow: v })}
          label="Arrow for the better move"
          hint="Shown after inaccuracies, mistakes and blunders."
        />
        <Check
          checked={s.engineArrow}
          onChange={(v) => updateSettings({ engineArrow: v })}
          label="Arrow for the engine’s next move"
        />
        <Check checked={s.sound} onChange={(v) => updateSettings({ sound: v })} label="Move sounds" />
      </fieldset>

      <fieldset className="set">
        <legend>Appearance</legend>
        <div className="segmented" role="radiogroup" aria-label="Color theme">
          {(['system', 'light', 'dark'] as ThemeSetting[]).map((t) => (
            <label key={t} className="segment">
              <input type="radio" name="theme" checked={s.theme === t} onChange={() => updateSettings({ theme: t })} />
              <span>{t === 'system' ? 'Match device' : t === 'light' ? 'Light' : 'Dark'}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="set">
        <legend>Saved data</legend>
        <p className="field-hint">Analyses are stored in this browser so reopening a game is instant.</p>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            void clearHistory().then(() => notify('Saved analyses deleted'));
          }}
        >
          Delete saved analyses
        </button>
      </fieldset>
    </Dialog>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['←', '→'], 'Previous / next move'],
  [['Home', 'End'], 'Start / end of the game'],
  [['↑', '↓'], 'Start / end of the game'],
  [['N'], 'Next mistake'],
  [['F'], 'Flip the board'],
  [['L'], 'Turn the live engine on or off'],
  [['Esc'], 'Leave a side line'],
  [['?'], 'Show this list'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="shortcuts">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what + keys.join()} className="shortcut">
            <dt>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
