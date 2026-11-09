import { Chess, type Position } from 'chessops/chess';
import { INITIAL_FEN, makeFen } from 'chessops/fen';
import {
  ChildNode,
  makeComment,
  makePgn,
  Node,
  parseComment,
  parsePgn,
  parseVariant,
  startingPosition,
  type Game,
  type PgnNodeData,
} from 'chessops/pgn';
import { makeSan, parseSan } from 'chessops/san';
import type { NormalMove, SquareName } from 'chessops/types';
import { opposite } from 'chessops/util';
import { cyrb53 } from '../openings/hash';
import { displaySquares, positionFromFen, toEngineUci } from './moves';

export type Color = 'white' | 'black';

export interface GameMove {
  /** 1-based ply number. Ply 1 is the first move of the game. */
  ply: number;
  san: string;
  /** UCI in the format the engine expects (e1g1 for castling in standard chess). */
  uci: string;
  /** Squares to highlight on the board. */
  from: SquareName;
  to: SquareName;
  color: Color;
  /** Full-move number this move belongs to. */
  moveNumber: number;
  fenBefore: string;
  fenAfter: string;
  /** Seconds left on the mover's clock after the move, when the PGN has [%clk] comments. */
  clock?: number;
  capture: boolean;
  check: boolean;
  castle: boolean;
  /** Number of legal moves the mover had. 1 means the move was forced. */
  legalMoves: number;
}

export type Termination = 'checkmate' | 'stalemate' | 'insufficient';

export interface ParsedGame {
  /** Stable id derived from the start position and moves. Used to cache analysis. */
  id: string;
  headers: Record<string, string>;
  initialFen: string;
  standardStart: boolean;
  chess960: boolean;
  moves: GameMove[];
  /** fens[i] is the position after i plies (fens[0] is the start). */
  fens: string[];
  result: string;
  /** How the final position ended, if it is a finished position on the board. */
  termination?: Termination;
  /** Clean PGN of the main line, used for saving and sharing. */
  pgn: string;
}

export class GameParseError extends Error {}

const fenOf = (pos: Position) => makeFen(pos.toSetup());

const countLegalMoves = (pos: Position): number => {
  let n = 0;
  for (const [, dests] of pos.allDests()) n += dests.size();
  return n;
};

export function terminationOf(pos: Position): Termination | undefined {
  if (pos.isCheckmate()) return 'checkmate';
  if (pos.isStalemate()) return 'stalemate';
  if (pos.isInsufficientMaterial()) return 'insufficient';
  return undefined;
}

function headerRecord(headers: Map<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of headers) {
    if (v !== '' && v !== '?' && v !== '????.??.??') out[k] = v;
  }
  return out;
}

function isChess960(headers: Map<string, string>): boolean {
  return /960|fischer/i.test(headers.get('Variant') ?? '');
}

/** Builds a ParsedGame from one chessops PGN game (main line only). */
export function buildGame(game: Game<PgnNodeData>): ParsedGame {
  const variant = game.headers.get('Variant');
  const rules = parseVariant(variant);
  if (variant && rules !== 'chess') {
    throw new GameParseError(`The ${variant} variant isn't supported — only standard chess and Chess960.`);
  }
  const start = startingPosition(game.headers);
  if (start.isErr) throw new GameParseError('The game has an invalid starting position (FEN header).');
  const pos = start.value as Chess;
  const chess960 = isChess960(game.headers);
  const initialFen = fenOf(pos);
  const moves: GameMove[] = [];
  const fens = [initialFen];

  let ply = 0;
  for (const node of game.moves.mainline()) {
    const move = parseSan(pos, node.san) as NormalMove | undefined;
    const moveNumber = pos.fullmoves;
    const color = pos.turn;
    if (!move) {
      throw new GameParseError(
        `Illegal move "${node.san}" at ${moveNumber}${color === 'white' ? '.' : '...'} — the PGN may be corrupted.`,
      );
    }
    const fenBefore = fenOf(pos);
    const legalMoves = countLegalMoves(pos);
    const [from, to] = displaySquares(pos, move);
    const uci = toEngineUci(pos, move, chess960);
    const capture =
      pos.board[opposite(pos.turn)].has(move.to) || (pos.board.pawn.has(move.from) && pos.epSquare === move.to);
    const castle = pos.board.king.has(move.from) && pos.board[pos.turn].has(move.to);
    const san = makeSan(pos, move);
    pos.play(move);
    ply++;
    let clock: number | undefined;
    for (const c of node.comments ?? []) {
      const parsed = parseComment(c);
      if (parsed.clock !== undefined) clock = parsed.clock;
    }
    moves.push({
      ply,
      san,
      uci,
      from,
      to,
      color,
      moveNumber,
      fenBefore,
      fenAfter: fenOf(pos),
      clock,
      capture,
      check: pos.isCheck(),
      castle,
      legalMoves,
    });
    fens.push(fenOf(pos));
  }

  const headers = headerRecord(game.headers);
  const termination = terminationOf(pos);
  let result = headers.Result ?? '*';
  if (result === '*' && termination === 'checkmate') result = pos.turn === 'white' ? '0-1' : '1-0';
  else if (result === '*' && termination) result = '1/2-1/2';

  const standardStart = initialFen === INITIAL_FEN;
  const id = cyrb53(`${initialFen}|${moves.map((m) => m.uci).join(' ')}|${headers.White ?? ''}|${headers.Black ?? ''}|${headers.Date ?? ''}`);
  return {
    id,
    headers,
    initialFen,
    standardStart,
    chess960,
    moves,
    fens,
    result,
    termination,
    pgn: cleanPgn(game, headers),
  };
}

/** Re-serializes a game's main line with its headers and clock comments, dropping variations. */
function cleanPgn(game: Game<PgnNodeData>, headers: Record<string, string>): string {
  const out: Game<PgnNodeData> = { headers: new Map(Object.entries(headers)), moves: new Node() };
  let parent: Node<PgnNodeData> = out.moves;
  for (const node of game.moves.mainlineNodes()) {
    const clocks = (node.data.comments ?? [])
      .map((c) => parseComment(c).clock)
      .filter((c): c is number => c !== undefined);
    const child = new ChildNode<PgnNodeData>({
      san: node.data.san,
      comments: clocks.length ? [makeComment({ clock: clocks[0] })] : undefined,
    });
    parent.children.push(child);
    parent = child;
  }
  return makePgn(out).trim();
}

/** Looks like a FEN rather than a PGN? */
export function looksLikeFen(text: string): boolean {
  const t = text.trim();
  return /^[1-8pnbrqkPNBRQK/]+\s+[wb]\s+[-KQkqA-Ha-h]+\s+(-|[a-h][36])(\s+\d+\s+\d+)?$/.test(t);
}

/** A game with no moves, starting from a FEN. Lets people analyze a single position. */
export function gameFromFen(fen: string): ParsedGame {
  let pos: Chess;
  try {
    pos = positionFromFen(fen);
  } catch (e) {
    throw new GameParseError((e as Error).message);
  }
  const initialFen = fenOf(pos);
  const headers: Record<string, string> = { Event: 'Position analysis', SetUp: '1', FEN: initialFen };
  return {
    id: cyrb53(`fen|${initialFen}`),
    headers,
    initialFen,
    standardStart: initialFen === INITIAL_FEN,
    chess960: false,
    moves: [],
    fens: [initialFen],
    result: '*',
    termination: terminationOf(pos),
    pgn: `[SetUp "1"]\n[FEN "${initialFen}"]\n\n*`,
  };
}

/**
 * Parses PGN text (one or many games) or a FEN.
 * Games that fail to parse are reported in `errors` instead of throwing, so one
 * bad game in a big file does not hide the rest.
 */
export function parseGames(text: string): { games: ParsedGame[]; errors: string[] } {
  const trimmed = text.trim();
  if (!trimmed) return { games: [], errors: ['Paste a PGN or FEN first.'] };
  if (looksLikeFen(trimmed)) {
    try {
      return { games: [gameFromFen(trimmed)], errors: [] };
    } catch (e) {
      return { games: [], errors: [(e as Error).message] };
    }
  }
  const games: ParsedGame[] = [];
  const errors: string[] = [];
  for (const g of parsePgn(trimmed)) {
    try {
      const parsed = buildGame(g);
      if (parsed.moves.length === 0 && !g.headers.get('FEN')) continue;
      games.push(parsed);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (games.length === 0 && errors.length === 0) {
    errors.push("Couldn't find any moves. Check that this is a PGN (e.g. 1. e4 e5 2. Nf3) or a FEN.");
  }
  return { games, errors };
}

/** Parses exactly one game, throwing a GameParseError with a friendly message on failure. */
export function parseSingleGame(text: string): ParsedGame {
  const { games, errors } = parseGames(text);
  if (games.length === 0) throw new GameParseError(errors[0] ?? 'No game found.');
  return games[0];
}

/** Display name for a player, falling back to the color. */
export function playerName(game: ParsedGame, color: Color): string {
  const name = color === 'white' ? game.headers.White : game.headers.Black;
  return name && name !== '?' ? name : color === 'white' ? 'White' : 'Black';
}

export function playerRating(game: ParsedGame, color: Color): string | undefined {
  const r = color === 'white' ? game.headers.WhiteElo : game.headers.BlackElo;
  return r && /^\d+$/.test(r) ? r : undefined;
}

export const STANDARD_START_FEN = INITIAL_FEN;
export { Chess };
