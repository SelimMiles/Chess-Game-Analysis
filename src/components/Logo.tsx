/** The mark: a magnifying lens over a "?!" annotation. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <circle cx="13.5" cy="13.5" r="10" fill="var(--sheet)" stroke="var(--ink)" strokeWidth="2.6" />
      <path d="M21 21 L28.5 28.5" stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" />
      <text
        x="13.5"
        y="14.2"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-book)"
        fontWeight="700"
        fontSize="11"
        fill="var(--redpen)"
      >
        ?!
      </text>
    </svg>
  );
}
