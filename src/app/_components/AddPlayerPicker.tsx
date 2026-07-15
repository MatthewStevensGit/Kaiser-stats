"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { checkInExistingPlayer, checkInNewPlayer } from "@/lib/matchday/actions";

export function AddPlayerPicker({
  gameId,
  roster,
}: {
  gameId: string;
  roster: { canonicalId: string; displayName: string }[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = filter.trim()
    ? roster.filter((p) => p.displayName.toLowerCase().includes(filter.trim().toLowerCase()))
    : roster;

  function addExisting(canonicalId: string) {
    setError(null);
    startTransition(async () => {
      const result = await checkInExistingPlayer(gameId, canonicalId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFilter("");
      router.refresh();
    });
  }

  function addNew() {
    setError(null);
    startTransition(async () => {
      const result = await checkInNewPlayer(gameId, filter);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFilter("");
      router.refresh();
    });
  }

  return (
    <div className="add-player-picker">
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search the roster..."
        className="login-form-input"
        disabled={isPending}
      />
      {error && <p className="note login-form-error">{error}</p>}
      <ul className="add-player-picker-list">
        {filtered.map((p) => (
          <li key={p.canonicalId}>
            <button type="button" onClick={() => addExisting(p.canonicalId)} disabled={isPending}>
              {p.displayName}
            </button>
          </li>
        ))}
      </ul>
      {filter.trim() && (
        <button type="button" className="add-player-picker-new" onClick={addNew} disabled={isPending}>
          + Add &ldquo;{filter.trim()}&rdquo; as a new player
        </button>
      )}
    </div>
  );
}
