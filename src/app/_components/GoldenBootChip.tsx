/** One boot icon per season Golden Boot won — same size/repeat pattern as GoalChip/AssistChip. */
export function GoldenBootChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="goal-chip" aria-label={`${count} Golden Boot${count === 1 ? "" : "s"}`}>
      <span aria-hidden="true">{"🥾".repeat(count)}</span>
    </span>
  );
}
