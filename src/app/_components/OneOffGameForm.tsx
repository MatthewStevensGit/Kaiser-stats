"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createOneOffGame } from "@/lib/matchday/actions";
import {
  deriveLeagueFromDate,
  formatEasternDateTimeLocal,
  getRegistrationCutoffUtc,
} from "@/lib/matchday/registration-window";
import { useToast } from "./ToastProvider";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The registration cutoff a brand-new game would get by default, given only its date — empty until a valid date is entered. */
function computeDefaultCutoffLocal(date: string): string {
  if (!ISO_DATE_PATTERN.test(date)) return "";
  const league = deriveLeagueFromDate(date);
  return formatEasternDateTimeLocal(getRegistrationCutoffUtc(date, league));
}

export function OneOffGameForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [date, setDate] = useState("");
  const [kickoffLabel, setKickoffLabel] = useState("");
  const [venue, setVenue] = useState("");
  // null = "track the computed default as the date changes" (see
  // computeDefaultCutoffLocal, recomputed fresh every render) — same pattern
  // as DraftPanel's turn-sizes override: once the admin explicitly edits
  // this, it stops following the date field.
  const [cutoffManualOverride, setCutoffManualOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cutoffLocal = cutoffManualOverride ?? computeDefaultCutoffLocal(date);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await createOneOffGame({
          date,
          kickoffLabel,
          venue,
          cutoffOverrideRaw: cutoffLocal || null,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        showToast("success", "Game created.");
        router.push("/matchday");
        router.refresh();
      } catch {
        setError("Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <label htmlFor="one-off-date" className="login-form-label">
        Date
      </label>
      <input
        id="one-off-date"
        type="date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />

      <label htmlFor="one-off-kickoff" className="login-form-label">
        Kickoff time
      </label>
      <input
        id="one-off-kickoff"
        type="text"
        required
        placeholder="e.g. 8:00 AM ET"
        value={kickoffLabel}
        onChange={(e) => setKickoffLabel(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />

      <label htmlFor="one-off-venue" className="login-form-label">
        Venue
      </label>
      <input
        id="one-off-venue"
        type="text"
        required
        placeholder="e.g. Kaiser Park"
        value={venue}
        onChange={(e) => setVenue(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />

      <label htmlFor="one-off-cutoff" className="login-form-label">
        Registration cutoff
      </label>
      <input
        id="one-off-cutoff"
        type="datetime-local"
        value={cutoffLocal}
        onChange={(e) => setCutoffManualOverride(e.target.value)}
        className="login-form-input"
        disabled={isPending || !date}
      />
      <p className="note">
        Defaults to the normal weekly schedule for whichever day you pick — for a
        same-day or otherwise irregular game, change this so registration isn&rsquo;t
        already closed by the time you save.
      </p>

      {error && <p className="note login-form-error">{error}</p>}

      <button type="submit" className="login-form-submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create game"}
      </button>
    </form>
  );
}
