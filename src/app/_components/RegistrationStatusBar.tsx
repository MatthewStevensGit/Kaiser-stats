import { formatCutoffLabel } from "@/lib/matchday/registration-window";
import type { RegistrationStatus } from "@/lib/matchday/registration-window";

export function RegistrationStatusBar({
  status,
  opensAt,
  closesAt,
}: {
  status: RegistrationStatus;
  opensAt: Date;
  closesAt: Date;
}) {
  const message =
    status === "open"
      ? `Registration is open — closes ${formatCutoffLabel(closesAt)}.`
      : status === "not-open"
        ? `Registration opens ${formatCutoffLabel(opensAt)}.`
        : "Registration Closed";

  return <div className={`registration-status-bar registration-status-bar-${status}`}>{message}</div>;
}
