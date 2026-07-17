/** One boot per season this player won that season's Golden Boot — same size/repeat pattern as GoalChip. */
export function GoldenBootChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="goal-chip" aria-label={`${count} golden boot${count === 1 ? "" : "s"}`}>
      <span aria-hidden="true">{"👢".repeat(count)}</span>
    </span>
  );
}
