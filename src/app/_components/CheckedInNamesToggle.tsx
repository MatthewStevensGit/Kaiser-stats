"use client";

import { useState } from "react";

/**
 * A click target (the count badge on the list, or the capacity ring/count on
 * the check-in portal) that reveals who's checked in so far — display names
 * only, no admin metadata (see getGameCheckinDetails's doc comment for why
 * that function stays admin-gated; this reads from the already-public
 * players table instead, same as every other name shown in this app).
 */
export function CheckedInNamesToggle({
  className,
  triggerLabel,
  triggerAriaLabel,
  names,
}: {
  className?: string;
  triggerLabel: React.ReactNode;
  triggerAriaLabel: string;
  names: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        className="checkedin-toggle-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={triggerAriaLabel}
      >
        {triggerLabel}
      </button>
      {open &&
        (names.length === 0 ? (
          <p className="checkedin-names-empty">No one has checked in yet.</p>
        ) : (
          <ul className="checkedin-names-list">
            {names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ))}
    </div>
  );
}
