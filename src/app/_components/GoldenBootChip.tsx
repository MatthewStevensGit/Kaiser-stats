/**
 * Gold pill badge for Golden Boot titles won — deliberately distinct from
 * GoalChip/AssistChip's repeated-icon strip, since this is a season award
 * (at most a handful, ever), not a per-game counted stat where repeating the
 * icon reads naturally. Same gold color as MvpBadge, tying "trophy" styling
 * together across the app.
 */
export function GoldenBootChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="golden-boot-chip" aria-label={`${count} Golden Boot${count === 1 ? "" : "s"}`}>
      <span aria-hidden="true">🥾</span>
      {count}
    </span>
  );
}
