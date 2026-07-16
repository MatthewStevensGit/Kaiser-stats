/**
 * Trophy ribbon for a game's determined MVP. Display-only — the actual call
 * (GameRecord.mvpCanonicalId) is made elsewhere, by the report parser's own
 * judgment (goals, assists, narrative — see prompt.ts), never a fact Vadim
 * states himself (he never names one). Labeled "MVP Pick" rather than plain
 * "MVP" specifically so it reads as the app's own derived call, not a
 * stated fact — per kaiser_BUILD_SPEC.md's MVP section. This component just
 * renders whatever call already exists; it never guesses one itself.
 */
export function MvpBadge({ name }: { name?: string }) {
  return (
    <span className="mvp-badge" aria-label={name ? `MVP Pick: ${name}` : "MVP Pick"}>
      <span aria-hidden="true">🏆</span>
      {name ? `MVP Pick: ${name}` : "MVP Pick"}
    </span>
  );
}
