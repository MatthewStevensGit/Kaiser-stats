"use client";

import { useMemo, useState } from "react";

interface PlayerOption {
  canonicalId: string;
  displayName: string;
}

function sortByName(players: PlayerOption[]): PlayerOption[] {
  return [...players].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Replaces a flat "every player in the system, all at once" checkbox list with
 * a small current-pool list (remove button per person) plus a searchable
 * alphabetical add list — the pool stays local React state until Save
 * Setup/Begin Draft persists it (same pattern the checkbox list it replaces
 * already used), this only changes how a player gets added or removed. Typing
 * filters by prefix ("type-ahead"), not substring — leaving the field empty
 * shows every eligible player in alphabetical order, scrollable.
 */
export function DraftPoolPicker({
  players,
  pool,
  onChange,
  disabled,
  capacity,
}: {
  players: PlayerOption[];
  pool: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  /** The league's normal capacity, shown alongside the live count (e.g. "22 / 24") so the admin can see at a glance whether they're short, at, or over the usual size — purely informational, never enforced here. */
  capacity?: number;
}) {
  const [search, setSearch] = useState("");

  const poolMembers = useMemo(
    () => sortByName(players.filter((p) => pool.has(p.canonicalId))),
    [players, pool],
  );

  const availableOptions = useMemo(() => {
    const notInPool = players.filter((p) => !pool.has(p.canonicalId));
    const searchNorm = search.trim().toLowerCase();
    const filtered = searchNorm
      ? notInPool.filter((p) => p.displayName.toLowerCase().startsWith(searchNorm))
      : notInPool;
    return sortByName(filtered);
  }, [players, pool, search]);

  function remove(canonicalId: string) {
    const next = new Set(pool);
    next.delete(canonicalId);
    onChange(next);
  }

  function add(canonicalId: string) {
    const next = new Set(pool);
    next.add(canonicalId);
    onChange(next);
    setSearch("");
  }

  return (
    <div className="draft-pool-picker">
      <p className="draft-pool-count">
        {poolMembers.length}
        {capacity ? ` / ${capacity}` : ""} in the pool
      </p>
      {poolMembers.length === 0 ? (
        <p className="note">No one in the pool yet — add players below.</p>
      ) : (
        <ul className="draft-pool-current-list">
          {poolMembers.map((p) => (
            <li key={p.canonicalId} className="draft-pool-current-item">
              <span>{p.displayName}</span>
              <button
                type="button"
                className="draft-pool-remove"
                onClick={() => remove(p.canonicalId)}
                disabled={disabled}
                aria-label={`Remove ${p.displayName} from the pool`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Add a player — start typing a name..."
        className="login-form-input"
        disabled={disabled}
      />
      {availableOptions.length === 0 ? (
        <p className="note">No matching players.</p>
      ) : (
        <ul className="draft-pool-add-list">
          {availableOptions.map((p) => (
            <li key={p.canonicalId}>
              <button type="button" onClick={() => add(p.canonicalId)} disabled={disabled}>
                {p.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
