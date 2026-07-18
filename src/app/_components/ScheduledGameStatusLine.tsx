import type { MatchdayStatusTier } from "@/lib/matchday/registration-window";

const LABEL_BY_TIER: Record<MatchdayStatusTier, string> = {
  scheduled: "Scheduled",
  open: "Registration Open",
  "closing-soon": "Closing Soon — Hurry",
  filled: "Registration Filled",
  closed: "Registration Closed",
};

export function ScheduledGameStatusLine({
  tier,
  kickoffLabel,
  venue,
}: {
  tier: MatchdayStatusTier;
  kickoffLabel: string;
  venue: string;
}) {
  return (
    <div className="matchday-status-line">
      <span className={`status-dot status-dot-${tier}`} aria-hidden="true" />
      <span>{LABEL_BY_TIER[tier]}</span>
      <span aria-hidden="true">·</span>
      <span>{kickoffLabel}</span>
      <span aria-hidden="true">·</span>
      <span>{venue}</span>
    </div>
  );
}
