import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Dests, Key } from 'chessground/types';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { BoardTheme } from '../state/settings';

interface Props {
  fen: string;
  orientation: 'white' | 'black';
  turnColor: 'white' | 'black';
  lastMove?: [Key, Key];
  check: boolean;
  dests: Dests;
  shapes: DrawShape[];
  coordinates: boolean;
  theme: BoardTheme;
  onMove: (orig: Key, dest: Key) => void;
  label: string;
}

const BRUSHES = {
  best: { key: 'bs', color: '#2e9a5e', opacity: 0.85, lineWidth: 11 },
  engine: { key: 'en', color: '#2f6be6', opacity: 0.7, lineWidth: 10 },
  engine2: { key: 'e2', color: '#2f6be6', opacity: 0.4, lineWidth: 8 },
};

export function Board({ fen, orientation, turnColor, lastMove, check, dests, shapes, coordinates, theme, onMove, label }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | undefined>(undefined);
  const latest = useRef({ fen, lastMove, onMove });
  useLayoutEffect(() => {
    latest.current = { fen, lastMove, onMove };
  });

  useEffect(() => {
    if (!el.current) return;
    const cg = Chessground(el.current, {
      fen,
      orientation,
      turnColor,
      lastMove,
      check,
      coordinates,
      animation: { enabled: true, duration: 160 },
      highlight: { lastMove: true, check: true },
      movable: {
        free: false,
        color: turnColor,
        dests,
        showDests: true,
        events: {
          after: (orig, dest) => {
            const before = latest.current.fen;
            latest.current.onMove(orig, dest);
            // If the move was not accepted, put the pieces back.
            setTimeout(() => {
              if (latest.current.fen === before) cg.set({ fen: before, lastMove: latest.current.lastMove });
            });
          },
        },
      },
      premovable: { enabled: false },
      draggable: { enabled: true, showGhost: true },
      drawable: { enabled: true, visible: true, brushes: BRUSHES as never },
    });
    api.current = cg;
    return () => {
      cg.destroy();
      api.current = undefined;
    };
    // Chessground is created once; later changes go through api.set below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.set({
      fen,
      orientation,
      turnColor,
      lastMove,
      check: check ? turnColor : false,
      movable: { color: turnColor, dests },
    });
    api.current?.setShapes([]);
  }, [fen, orientation, turnColor, lastMove, check, dests]);

  useEffect(() => {
    api.current?.setAutoShapes(shapes);
  }, [shapes]);

  useEffect(() => {
    if (!api.current) return;
    api.current.set({ coordinates });
    api.current.redrawAll();
  }, [coordinates]);

  return (
    <div className={`board board-${theme}`} role="img" aria-label={label}>
      <div ref={el} />
    </div>
  );
}
