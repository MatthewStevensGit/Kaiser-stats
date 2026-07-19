"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeOnboarding } from "@/lib/auth/actions";
import { POSITIONS, type Position } from "@/lib/stats-engine/positions";

const MIN_PASSWORD_LENGTH = 8;

export function OnboardingForm({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [rosterName, setRosterName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await completeOnboarding(displayName, rosterName, password, positions);
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

      {/* Hidden, but present so the browser's password manager can associate
          the new password with this account's email — without a username
          field in the same form, most browsers won't offer to save it, or
          won't autofill it correctly on the login page later. */}
      <input type="email" name="email" value={email} readOnly autoComplete="username" hidden />

      <label htmlFor="onboarding-password" className="login-form-label">
        Create a password
      </label>
      <input
        id="onboarding-password"
        type="password"
        required
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />

      <label htmlFor="onboarding-confirm-password" className="login-form-label">
        Confirm password
      </label>
      <input
        id="onboarding-confirm-password"
        type="password"
        required
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />
      <p className="note">
        You&rsquo;ll use this to log in going forward instead of a fresh code every time.
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
        disabled={isPending || !displayName.trim() || !rosterName.trim() || !password || !confirmPassword}
      >
        {isPending ? "Saving..." : "Save and continue"}
      </button>
    </form>
  );
}
