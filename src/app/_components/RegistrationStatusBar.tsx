import { formatCutoffLabel } from "@/lib/matchday/registration-window";
import type { MatchdayStatusTier } from "@/lib/matchday/registration-window";

export function RegistrationStatusBar({
  tier,
  opensAt,
  closesAt,
}: {
  tier: MatchdayStatusTier;
  opensAt: Date;
  closesAt: Date;
}) {
  const message =
    tier === "open"
      ? `Registration is open — closes ${formatCutoffLabel(closesAt)}.`
      : tier === "closing-soon"
        ? `Registration closing soon — closes ${formatCutoffLabel(closesAt)}. Hurry!`
        : tier === "scheduled"
          ? `Registration opens ${formatCutoffLabel(opensAt)}.`
          : tier === "filled"
            ? "Registration Filled"
            : "Registration Closed";

  return <div className={`registration-status-bar registration-status-bar-${tier}`}>{message}</div>;
}
