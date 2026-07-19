"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { checkInExistingPlayer, checkInNewPlayer } from "@/lib/matchday/actions";
import { rosterDisplayName } from "@/lib/stats-engine/identity";

export function AddPlayerPicker({
  gameId,
  roster,
}: {
  gameId: string;
  roster: { canonicalId: string; displayName: string; rosterName?: string | null }[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = filter.trim()
    ? roster.filter((p) => rosterDisplayName(p).toLowerCase().includes(filter.trim().toLowerCase()))
    : roster;

  function addExisting(canonicalId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await checkInExistingPlayer(gameId, canonicalId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setFilter("");
        router.refresh();
      } catch {
        setError("Something went wrong — please try again.");
      }
    });
  }

  function addNew() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await checkInNewPlayer(gameId, filter);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setFilter("");
        router.refresh();
      } catch {
        setError("Something went wrong — please try again.");
      }
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
              {rosterDisplayName(p)}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="add-player-picker-new"
        onClick={addNew}
        disabled={isPending || !filter.trim()}
      >
        {filter.trim() ? <>+ Create Player: &ldquo;{filter.trim()}&rdquo;</> : "+ Create Player"}
      </button>
    </div>
  );
}
