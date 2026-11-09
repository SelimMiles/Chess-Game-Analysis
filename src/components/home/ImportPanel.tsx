import { LoaderCircle, Upload } from 'lucide-react';
import { useId, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { parseGames, playerName, type ParsedGame } from '../../lib/chess/game';
import { fetchChessComGames } from '../../lib/sources/chesscom';
import { fetchLichessGame, fetchLichessGames, parseLichessGameId } from '../../lib/sources/lichess';
import type { GameSource as Site, RemoteGame } from '../../lib/sources/types';
import { readLocal, writeLocal } from '../../lib/storage';
import { openGame, openPgn } from '../../state/store';
import { RemoteGameList } from './RemoteGameList';

type Tab = 'paste' | Site;

const TABS: { id: Tab; label: string }[] = [
  { id: 'paste', label: 'Paste a game' },
  { id: 'lichess', label: 'Lichess' },
  { id: 'chesscom', label: 'Chess.com' },
];

interface Remembered {
  tab: Tab;
  lichess: string;
  chesscom: string;
}

function PastePane() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [choices, setChoices] = useState<ParsedGame[]>([]);
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const id = useId();

  const analyze = (value = text) => {
    setChoices([]);
    const { games, errors } = parseGames(value);
    if (games.length === 0) {
      setError(errors[0]);
      return;
    }
    setError(undefined);
    if (games.length === 1) openGame(games[0], { kind: 'paste' });
    else setChoices(games);
  };

  const readFile = async (f: File) => {
    if (f.size > 20 * 1024 * 1024) {
      setError('That file is larger than 20 MB. Split it into smaller PGN files.');
      return;
    }
    const content = await f.text();
    setText(content);
    analyze(content);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    analyze();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) analyze();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void readFile(f);
  };

  return (
    <form className="pane" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={`${id}-pgn`}>
        PGN or FEN
      </label>
      <textarea
        id={`${id}-pgn`}
        className={`textarea paste-area${dragging ? ' is-dragging' : ''}`}
        rows={7}
        spellCheck={false}
        placeholder={'Paste a PGN, e.g. 1. e4 e5 2. Nf3 Nc6\nor a FEN to analyze a single position.\nYou can also drop a .pgn file here.'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p className="error-text" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      <div className="pane-actions">
        <button type="submit" className="btn btn-primary">
          Analyze game
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          <Upload size={16} aria-hidden="true" /> Open a PGN file
        </button>
        <input
          ref={file}
          type="file"
          accept=".pgn,.txt,application/x-chess-pgn,text/plain"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {choices.length > 1 && (
        <div className="choices">
          <p className="choices-title">This file has {choices.length} games. Pick one to analyze.</p>
          <ul className="game-list scroll">
            {choices.map((g, i) => (
              <li key={`${g.id}-${i}`}>
                <button type="button" className="game-row" onClick={() => openGame(g, { kind: 'paste' })}>
                  <span className="game-row-main">
                    {playerName(g, 'white')} – {playerName(g, 'black')}
                  </span>
                  <span className="game-row-meta">
                    {[g.headers.Event, g.headers.Date?.replace(/\.\?\?/g, ''), `${Math.ceil(g.moves.length / 2)} moves`, g.result]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

function SitePane({ site, initial, onRemember }: { site: Site; initial: string; onRemember: (name: string) => void }) {
  const [input, setInput] = useState(initial);
  const [games, setGames] = useState<RemoteGame[]>();
  const [user, setUser] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const id = useId();
  const siteName = site === 'lichess' ? 'Lichess' : 'Chess.com';

  const load = async (e: FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) {
      setError(`Enter a ${siteName} username.`);
      return;
    }
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setLoading(true);
    setError(undefined);
    try {
      if (site === 'lichess' && /lichess\.org\//i.test(value)) {
        const gameId = parseLichessGameId(value);
        if (!gameId) {
          setError('That link doesn’t point to a Lichess game. Game links look like lichess.org/abcd1234.');
          return;
        }
        const pgn = await fetchLichessGame(gameId, c.signal);
        const err = openPgn(pgn, { kind: 'lichess', url: `https://lichess.org/${gameId}` });
        if (err) setError(err);
        return;
      }
      const list = site === 'lichess' ? await fetchLichessGames(value, 30, c.signal) : await fetchChessComGames(value, 30, c.signal);
      if (c.signal.aborted) return;
      setUser(value);
      setGames(list);
      onRemember(value);
      if (list.length === 0) setError(`${value} has no recent games on ${siteName}.`);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      if (controller.current === c) setLoading(false);
    }
  };

  const pick = (g: RemoteGame) => {
    if (!['standard', 'chess', 'chess960', 'fromPosition'].includes(g.variant)) {
      setError(`This is a ${g.variant} game. Only standard chess and Chess960 can be analyzed.`);
      return;
    }
    const err = openPgn(g.pgn, { kind: site, url: g.url, username: user });
    if (err) setError(err);
  };

  return (
    <div className="pane">
      <form className="site-form" onSubmit={load}>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-user`}>
            {site === 'lichess' ? 'Lichess username or game link' : 'Chess.com username'}
          </label>
          <div className="site-row">
            <input
              id={`${id}-user`}
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={site === 'lichess' ? 'e.g. DrNykterstein' : 'e.g. Hikaru'}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null}
              {loading ? 'Loading' : 'Show games'}
            </button>
          </div>
          <p className="field-hint">Public games only. The request goes straight from your browser to {siteName}.</p>
        </div>
      </form>
      {error && (
        <p className="error-text" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      {games && games.length > 0 && <RemoteGameList games={games} username={user} onPick={pick} />}
    </div>
  );
}

/** Where a game comes from: pasted PGN/FEN, a Lichess account or link, or a Chess.com account. */
export function ImportPanel() {
  const remembered = readLocal<Remembered>('import', { tab: 'paste', lichess: '', chesscom: '' });
  const [tab, setTab] = useState<Tab>(remembered.tab);
  const id = useId();
  const remember = (patch: Partial<Remembered>) => writeLocal('import', { ...readLocal('import', remembered), ...patch });

  const select = (t: Tab) => {
    setTab(t);
    remember({ tab: t });
  };

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      select(next.id);
      document.getElementById(`${id}-tab-${next.id}`)?.focus();
    }
  };

  return (
    <section className="import" aria-label="Load a game">
      <div className="tabs" role="tablist" aria-label="Game source" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`${id}-tab-${t.id}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            aria-controls={`${id}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        {tab === 'paste' && <PastePane />}
        {tab === 'lichess' && (
          <SitePane key="lichess" site="lichess" initial={remembered.lichess} onRemember={(name) => remember({ lichess: name })} />
        )}
        {tab === 'chesscom' && (
          <SitePane key="chesscom" site="chesscom" initial={remembered.chesscom} onRemember={(name) => remember({ chesscom: name })} />
        )}
      </div>
    </section>
  );
}
