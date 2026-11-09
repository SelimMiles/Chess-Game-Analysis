import { Chessground } from 'chessground';
import type { Key } from 'chessground/types';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { SAMPLE_GAMES } from '../../data/samples';
import { clearHistory, deleteHistoryEntry, openPgn, useStore } from '../../state/store';
import { boardBadgeSvg } from '../MoveGlyph';
import { ImportPanel } from './ImportPanel';

/** The moment from the Opera Game shown on the home page: 16. Qb8+!, the queen sacrifice. */
const HERO_FEN = '1Q2kb1r/p2n1ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 b k - 1 16';

function HeroBoard({ onOpen }: { onOpen: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const theme = useStore((s) => s.settings.board);
  useEffect(() => {
    if (!el.current) return;
    const cg = Chessground(el.current, {
      fen: HERO_FEN,
      viewOnly: true,
      coordinates: false,
      lastMove: ['b3', 'b8'] as Key[],
      drawable: {
        enabled: false,
        visible: true,
        autoShapes: [{ orig: 'b8', customSvg: { html: boardBadgeSvg('great') } }],
      },
    });
    return () => cg.destroy();
  }, []);
  return (
    <figure className="hero-figure">
      <div className={`board board-${theme} hero-board`}>
        <div ref={el} role="img" aria-label="Morphy's 16. Qb8+, marked as a great move" />
      </div>
      <figcaption>
        <span className="hero-caption-move">16. Qb8+!</span> Morphy gives up his queen to force mate in two.{' '}
        <button type="button" className="link-btn" onClick={onOpen}>
          Review the whole game
        </button>
      </figcaption>
    </figure>
  );
}

function openSample(id: string, ply?: number) {
  const sample = SAMPLE_GAMES.find((s) => s.id === id);
  if (sample) openPgn(sample.pgn, { kind: 'sample' }, { ply });
}

export function HomeView() {
  const history = useStore((s) => s.history);
  return (
    <main className="home" id="main">
      <section className="hero">
        <div className="hero-copy">
          <h1>Find the moves that decided your game.</h1>
          <p className="hero-lede">
            Paste a game or load yours from Lichess or Chess.com. Stockfish 19 checks every move right here in your browser.
            Nothing is uploaded and there is no account to make.
          </p>
          <ImportPanel />
        </div>
        <HeroBoard onOpen={() => openSample('opera', 31)} />
      </section>

      <div className="home-lower">
        <section className="home-section" aria-labelledby="samples-title">
          <h2 id="samples-title">Try a classic</h2>
          <ul className="sample-list">
            {SAMPLE_GAMES.map((s) => (
              <li key={s.id}>
                <button type="button" className="sample" onClick={() => openSample(s.id)}>
                  <span className="sample-title">{s.title}</span>
                  <span className="sample-sub">{s.subtitle}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="home-section" aria-labelledby="recent-title">
          <div className="home-section-head">
            <h2 id="recent-title">Your recent analyses</h2>
            {history.length > 0 && (
              <button type="button" className="btn btn-quiet btn-small" onClick={() => void clearHistory()}>
                Clear all
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="home-empty">Games you analyze are kept here, in this browser only, so you can come back to them.</p>
          ) : (
            <ul className="history-list">
              {history.map((h) => (
                <li key={h.id} className="history-item">
                  <button
                    type="button"
                    className="history-open"
                    onClick={() => openPgn(h.pgn, { kind: 'history', url: h.source })}
                  >
                    <span className="history-players">
                      {h.white} – {h.black}
                    </span>
                    <span className="history-meta">
                      {[h.result.replace('1/2', '½'), `${Math.ceil(h.moves / 2)} moves`, h.date?.replace(/\.\?\?/g, '').replace(/\./g, '-')]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                    {h.accuracy && (
                      <span className="history-acc num">
                        {h.accuracy.white?.toFixed(1) ?? '–'} <span className="history-acc-sep">/</span> {h.accuracy.black?.toFixed(1) ?? '–'}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="icon-btn history-delete"
                    aria-label={`Remove ${h.white} – ${h.black}`}
                    onClick={() => void deleteHistoryEntry(h.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="home-footer">
        <p>
          Blunderscope runs the{' '}
          <a href="https://stockfishchess.org" target="_blank" rel="noreferrer">
            Stockfish
          </a>{' '}
          chess engine as WebAssembly on your device. Opening names come from the{' '}
          <a href="https://github.com/lichess-org/chess-openings" target="_blank" rel="noreferrer">
            Lichess opening database
          </a>
          . Free software under the GPL-3.0 licence.
        </p>
      </footer>
    </main>
  );
}
