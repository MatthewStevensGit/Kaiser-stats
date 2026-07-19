/** One trophy per season this player finished #1 in plus/minus, each tagged with that season's 2-digit year. */
export function LeagueTitleChip({ years }: { years: number[] }) {
  if (years.length === 0) return null;
  return (
    <span className="goal-chip" aria-label={`League title in ${years.join(", ")}`}>
      {years.map((y) => (
        <span key={y} aria-hidden="true">
          🏆&apos;{String(y).slice(-2)}
        </span>
      ))}
    </span>
  );
}
