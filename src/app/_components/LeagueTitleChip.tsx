/** One trophy per season this player finished #1 in plus/minus — same size/repeat pattern as GoalChip. */
export function LeagueTitleChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="goal-chip" aria-label={`${count} league title${count === 1 ? "" : "s"}`}>
      <span aria-hidden="true">{"🏆".repeat(count)}</span>
    </span>
  );
}
