import type { Classification } from '../lib/analysis/classify';
import { CLASSIFICATION_LABEL } from '../lib/analysis/explain';

/** Glyph shapes drawn inside a 100×100 circle. */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

const STAR = star(50, 53, 32, 14);
const CHECK = 'M28 52 L43 67 L72 35';
const BOOK = 'M50 34 C42 28 30 28 24 31 V70 C30 67 42 67 50 73 C58 67 70 67 76 70 V31 C70 28 58 28 50 34 Z M50 34 V73';
const ARROW = 'M28 50 H70 M56 35 L71 50 L56 65';

type Shape = { text: string; size: number } | { path: string; fill: boolean; width?: number };

const SHAPES: Record<Classification, Shape> = {
  best: { path: STAR, fill: true },
  great: { text: '!', size: 66 },
  excellent: { path: CHECK, fill: false, width: 13 },
  good: { path: CHECK, fill: false, width: 9 },
  book: { path: BOOK, fill: false, width: 7 },
  forced: { path: ARROW, fill: false, width: 10 },
  inaccuracy: { text: '?!', size: 50 },
  mistake: { text: '?', size: 64 },
  blunder: { text: '??', size: 50 },
};

function glyphMarkup(c: Classification, color: string): string {
  const shape = SHAPES[c];
  if ('text' in shape) {
    return `<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="${shape.size}" class="badge-glyph" style="fill:${color}">${shape.text}</text>`;
  }
  return shape.fill
    ? `<path d="${shape.path}" style="fill:${color}"/>`
    : `<path d="${shape.path}" fill="none" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round" style="stroke:${color}"/>`;
}

/**
 * SVG markup for a badge in the top-right corner of a board square
 * (chessground customSvg: 100×100 box covering the square).
 */
export function boardBadgeSvg(c: Classification): string {
  const inner = glyphMarkup(c, `var(--g-${c})`);
  return `<g transform="translate(64 2) scale(0.34)"><circle cx="50" cy="50" r="50" style="fill:var(--c-${c})" stroke="#fff" stroke-width="7"/>${inner}</g>`;
}

interface Props {
  classification: Classification;
  size?: number;
  /** Visually hidden label for screen readers. Defaults to the classification name. */
  label?: string | null;
  className?: string;
}

/** A round move-label icon, e.g. a red "??" for a blunder. */
export function MoveGlyph({ classification, size = 18, label, className }: Props) {
  const name = label === undefined ? CLASSIFICATION_LABEL[classification] : label;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={name ? 'img' : undefined}
      aria-label={name ?? undefined}
      aria-hidden={name ? undefined : true}
      dangerouslySetInnerHTML={{
        __html: `<circle cx="50" cy="50" r="50" style="fill:var(--c-${classification})"/>${glyphMarkup(classification, `var(--g-${classification})`)}`,
      }}
    />
  );
}
