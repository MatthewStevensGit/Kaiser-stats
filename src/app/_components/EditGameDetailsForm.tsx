"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateScheduledGame } from "@/lib/matchday/actions";
import { useToast } from "./ToastProvider";

export function EditGameDetailsForm({
  gameId,
  kickoffLabel: initialKickoffLabel,
  venue: initialVenue,
  cutoffLocalDefault,
}: {
  gameId: string;
  kickoffLabel: string;
  venue: string;
  /** The current effective cutoff (override if set, else the computed league default), pre-formatted for a datetime-local input. */
  cutoffLocalDefault: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [kickoffLabel, setKickoffLabel] = useState(initialKickoffLabel);
  const [venue, setVenue] = useState(initialVenue);
  const [cutoffLocal, setCutoffLocal] = useState(cutoffLocalDefault);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateScheduledGame(gameId, {
          kickoffLabel,
          venue,
          cutoffOverrideRaw: cutoffLocal || null,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        showToast("success", "Game details saved.");
        router.refresh();
      } catch {
        setError("Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <label htmlFor="edit-game-kickoff" className="login-form-label">
        Kickoff time
      </label>
      <input
        id="edit-game-kickoff"
        type="text"
        required
        value={kickoffLabel}
        onChange={(e) => setKickoffLabel(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />

      <label htmlFor="edit-game-venue" className="login-form-label">
        Venue
      </label>
      <input
        id="edit-game-venue"
        type="text"
        required
        value={venue}
        onChange={(e) => setVenue(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />

      <label htmlFor="edit-game-cutoff" className="login-form-label">
        Registration cutoff
      </label>
      <input
        id="edit-game-cutoff"
        type="datetime-local"
        value={cutoffLocal}
        onChange={(e) => setCutoffLocal(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />
      <button
        type="button"
        className="login-form-resend"
        onClick={() => setCutoffLocal("")}
        disabled={isPending || !cutoffLocal}
      >
        Reset to league default
      </button>

      {error && <p className="note login-form-error">{error}</p>}

      <button type="submit" className="login-form-submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save game details"}
      </button>
    </form>
  );
}
