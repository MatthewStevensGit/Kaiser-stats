/** One boot per season Golden Boot won, each tagged with that season's 2-digit year. */
export function GoldenBootChip({ years }: { years: number[] }) {
  if (years.length === 0) return null;
  return (
    <span className="goal-chip" aria-label={`Golden Boot in ${years.join(", ")}`}>
      {years.map((y) => (
        <span key={y} aria-hidden="true">
          🥾&apos;{String(y).slice(-2)}
        </span>
      ))}
    </span>
  );
}
