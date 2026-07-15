"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createOneOffGame } from "@/lib/matchday/actions";
import type { ScheduledLeague } from "@/lib/matchday/types";

export function OneOffGameForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [league, setLeague] = useState<ScheduledLeague>("saturday");
  const [kickoffLabel, setKickoffLabel] = useState("");
  const [venue, setVenue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createOneOffGame({ date, league, kickoffLabel, venue });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/matchday");
      router.refresh();
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

      <label htmlFor="one-off-league" className="login-form-label">
        League
      </label>
      <select
        id="one-off-league"
        value={league}
        onChange={(e) => setLeague(e.target.value as ScheduledLeague)}
        className="login-form-input"
        disabled={isPending}
      >
        <option value="saturday">Saturday</option>
        <option value="sunday">Sunday</option>
      </select>

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

      {error && <p className="note login-form-error">{error}</p>}

      <button type="submit" className="login-form-submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create game"}
      </button>
    </form>
  );
}
