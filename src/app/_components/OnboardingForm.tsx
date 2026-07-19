"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeOnboarding } from "@/lib/auth/actions";
import { POSITIONS, type Position } from "@/lib/stats-engine/positions";

export function OnboardingForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [rosterName, setRosterName] = useState(initialName);
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function togglePosition(position: Position) {
    setPositions((current) =>
      current.includes(position) ? current.filter((p) => p !== position) : [...current, position],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeOnboarding(displayName, rosterName, positions);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push("/");
        router.refresh();
      } catch {
        setError("Something went wrong saving your profile — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <label htmlFor="onboarding-display-name" className="login-form-label">
        Display name
      </label>
      <input
        id="onboarding-display-name"
        type="text"
        required
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />

      <label htmlFor="onboarding-roster-name" className="login-form-label">
        Roster name (the name used in game reports — please be accurate)
      </label>
      <input
        id="onboarding-roster-name"
        type="text"
        required
        value={rosterName}
        onChange={(e) => setRosterName(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />
      <p className="note">
        This is how captains and reports will recognize you — once set here, only an
        admin can change it later.
      </p>

      <label className="login-form-label">Positions you play (select any that apply)</label>
      <div className="member-positions-editor">
        {POSITIONS.map((position) => (
          <button
            key={position}
            type="button"
            className={positions.includes(position) ? "position-pill position-pill-active" : "position-pill"}
            disabled={isPending}
            onClick={() => togglePosition(position)}
            aria-pressed={positions.includes(position)}
          >
            {position}
          </button>
        ))}
      </div>
      <p className="note">
        Used to recommend well-rounded picks during the live draft. Not sure yet? Leave it
        blank — you can always set it later in Settings.
      </p>

      {error && <p className="note login-form-error">{error}</p>}

      <button
        type="submit"
        className="login-form-submit"
        disabled={isPending || !displayName.trim() || !rosterName.trim()}
      >
        {isPending ? "Saving..." : "Save and continue"}
      </button>
    </form>
  );
}
