"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateDisplayName, updateOwnPositions } from "@/lib/auth/actions";
import { POSITIONS, type Position } from "@/lib/stats-engine/positions";

function sameSet(a: Position[], b: Position[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((p) => bSet.has(p));
}

export function SettingsForm({
  displayName,
  email,
  positions: initialPositions,
}: {
  displayName: string;
  email: string;
  positions: Position[];
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [positions, setPositions] = useState<Position[]>(initialPositions);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function togglePosition(position: Position) {
    setPositions((current) =>
      current.includes(position) ? current.filter((p) => p !== position) : [...current, position],
    );
    setStatus("idle");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    startTransition(async () => {
      try {
        const nameChanged = name.trim() !== displayName.trim();
        if (nameChanged) {
          const result = await updateDisplayName(name);
          if (!result.ok) {
            setStatus("error");
            setError(result.error);
            return;
          }
        }
        if (!sameSet(positions, initialPositions)) {
          const result = await updateOwnPositions(positions);
          if (!result.ok) {
            setStatus("error");
            setError(result.error);
            return;
          }
        }
        setStatus("saved");
        router.refresh();
      } catch {
        setStatus("error");
        setError("Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <label htmlFor="settings-email" className="login-form-label">
        Email
      </label>
      <input id="settings-email" type="email" value={email} className="login-form-input" disabled readOnly />

      <label htmlFor="settings-name" className="login-form-label">
        Display name
      </label>
      <input
        id="settings-name"
        type="text"
        required
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setStatus("idle");
        }}
        className="login-form-input"
        disabled={isPending}
      />

      <label className="login-form-label">Positions you play</label>
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

      {status === "error" && error && <p className="note login-form-error">{error}</p>}
      {status === "saved" && <p className="note">Saved.</p>}

      <button type="submit" className="login-form-submit" disabled={isPending || !name.trim()}>
        {isPending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
