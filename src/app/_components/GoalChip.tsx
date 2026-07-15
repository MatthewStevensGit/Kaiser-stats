/** One goal icon per goal scored — two goals renders two balls, three renders three, etc. */
export function GoalChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="goal-chip" aria-label={`${count} goal${count === 1 ? "" : "s"}`}>
      <span aria-hidden="true">{"⚽".repeat(count)}</span>
    </span>
  );
}
