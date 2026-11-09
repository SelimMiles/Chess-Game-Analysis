interface Props {
  /** White's win percentage, 0–100. Undefined while unknown. */
  whiteWin?: number;
  /** Short text such as "+1.3" or "M2". */
  label?: string;
  /** Who is ahead, to place the label on that side of the bar. */
  leader: 'white' | 'black';
  orientation: 'white' | 'black';
}

/** Vertical bar showing who is better: White's share fills from White's side of the board. */
export function EvalBar({ whiteWin, label, leader, orientation }: Props) {
  const win = whiteWin ?? 50;
  const whiteAtBottom = orientation === 'white';
  const labelAtBottom = (leader === 'white') === whiteAtBottom;
  return (
    <div
      className={`evalbar${whiteWin === undefined ? ' is-pending' : ''}`}
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(win)}
      aria-valuetext={label ? `${label}, White ${Math.round(win)}% to win` : 'Not evaluated yet'}
    >
      <div
        className="evalbar-white"
        style={{ height: `${win}%`, [whiteAtBottom ? 'bottom' : 'top']: 0 }}
      />
      {label && (
        <span className={`evalbar-label num ${labelAtBottom ? 'at-bottom' : 'at-top'} on-${leader}`}>{label}</span>
      )}
    </div>
  );
}
