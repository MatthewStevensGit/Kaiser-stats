/**
 * Trophy ribbon for a game's determined MVP. Display-only — the actual call
 * (GameRecord.mvpCanonicalId) is made elsewhere: the report parser only ever
 * extracts an MVP when Vadim's own report states one as fact, resolved
 * through the same name-resolution path as rosters/goals. This component
 * just renders whatever call already exists; it never guesses one itself.
 */
export function MvpBadge({ name }: { name?: string }) {
  return (
    <span className="mvp-badge" aria-label={name ? `MVP: ${name}` : "MVP"}>
      <span aria-hidden="true">🏆</span>
      {name ? `MVP ${name}` : "MVP"}
    </span>
  );
}
