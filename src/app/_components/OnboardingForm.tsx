"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeOnboarding } from "@/lib/auth/actions";

export function OnboardingForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [rosterName, setRosterName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding(displayName, rosterName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/");
      router.refresh();
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
