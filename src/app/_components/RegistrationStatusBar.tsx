import { formatCutoffLabel } from "@/lib/matchday/registration-window";

export function RegistrationStatusBar({ isOpen, cutoffUtc }: { isOpen: boolean; cutoffUtc: Date }) {
  return (
    <div
      className={isOpen ? "registration-status-bar registration-status-bar-open" : "registration-status-bar registration-status-bar-closed"}
    >
      {isOpen
        ? `Registration is open — closes ${formatCutoffLabel(cutoffUtc)}.`
        : "Registration isn't open for this game."}
    </div>
  );
}
