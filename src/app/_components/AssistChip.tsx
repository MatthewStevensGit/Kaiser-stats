/** One cleat icon per assist — the closest emoji available for a soccer cleat, same size/repeat pattern as GoalChip. */
export function AssistChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="goal-chip" aria-label={`${count} assist${count === 1 ? "" : "s"}`}>
      <span aria-hidden="true">{"👟".repeat(count)}</span>
    </span>
  );
}
