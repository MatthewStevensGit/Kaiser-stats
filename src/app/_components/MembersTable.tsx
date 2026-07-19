"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeMember,
  restoreMember,
  setMemberAdmin,
  setMemberDisplayName,
  setMemberPositions,
  setMemberRosterName,
} from "@/lib/auth/actions";
import type { MemberRow } from "@/lib/auth/members-data";
import { POSITIONS, type Position } from "@/lib/stats-engine/positions";

function sameSet(a: Position[], b: Position[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((p) => bSet.has(p));
}

/**
 * The one admin surface for a member's account — display name, roster name
 * (the name used in game reports/live draft), admin status, and removed
 * status. Used to be two separate pages (Members, Identities); merged since
 * they were both just "manage this member's account" in different columns.
 * Only admins ever reach this page (requireAdmin gates it server-side); a
 * non-admin's only self-service name edit is their own display name, via
 * Settings' plain SettingsForm — never roster name, never anyone else's name.
 */
export function MembersTable({
  members,
  currentCanonicalId,
}: {
  members: MemberRow[];
  currentCanonicalId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [displayNameDrafts, setDisplayNameDrafts] = useState<Record<string, string>>({});
  const [rosterNameDrafts, setRosterNameDrafts] = useState<Record<string, string>>({});
  const [positionDrafts, setPositionDrafts] = useState<Record<string, Position[]>>({});

  function handleToggleAdmin(canonicalId: string, nextIsAdmin: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setMemberAdmin(canonicalId, nextIsAdmin);
        if (!result.ok) return setError(result.error);
        router.refresh();
      } catch {
        setError("Something went wrong — please try again.");
      }
    });
  }

  function handleToggleRemoved(canonicalId: string, displayName: string, nextIsRemoved: boolean) {
    if (nextIsRemoved && !window.confirm(`Remove ${displayName} from the league?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = nextIsRemoved ? await removeMember(canonicalId) : await restoreMember(canonicalId);
        if (!result.ok) return setError(result.error);
        router.refresh();
      } catch {
        setError("Something went wrong — please try again.");
      }
    });
  }

  function handleSaveMember(
    member: MemberRow,
    displayDraft: string,
    rosterDraft: string,
    positionsDraft: Position[],
  ) {
    const displayChanged = displayDraft.trim() !== member.displayName.trim();
    const rosterChanged = rosterDraft.trim() !== (member.rosterName ?? "").trim();
    const positionsChanged = !sameSet(positionsDraft, member.positions);
    if (!displayChanged && !rosterChanged && !positionsChanged) return;

    setError(null);
    startTransition(async () => {
      try {
        if (displayChanged) {
          const result = await setMemberDisplayName(member.canonicalId, displayDraft);
          if (!result.ok) return setError(result.error);
        }
        if (rosterChanged) {
          const result = await setMemberRosterName(member.canonicalId, rosterDraft);
          if (!result.ok) return setError(result.error);
        }
        if (positionsChanged) {
          const result = await setMemberPositions(member.canonicalId, positionsDraft);
          if (!result.ok) return setError(result.error);
        }
        router.refresh();
      } catch {
        setError("Something went wrong — please try again.");
      }
    });
  }

  function togglePosition(canonicalId: string, current: Position[], position: Position) {
    const next = current.includes(position) ? current.filter((p) => p !== position) : [...current, position];
    setPositionDrafts((d) => ({ ...d, [canonicalId]: next }));
  }

  if (members.length === 0) {
    return <div className="empty-state">No one has logged in yet.</div>;
  }

  return (
    <div className="table-scroll">
      {error && <p className="note login-form-error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Display Name</th>
            <th>Email</th>
            <th>Roster Name</th>
            <th>Positions</th>
            <th className="num"></th>
            <th className="num">Admin</th>
            <th className="num">Status</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const displayDraft = displayNameDrafts[m.canonicalId] ?? m.displayName;
            const rosterDraft = rosterNameDrafts[m.canonicalId] ?? m.rosterName ?? "";
            const positionsDraft = positionDrafts[m.canonicalId] ?? m.positions;
            const changed =
              displayDraft.trim() !== m.displayName.trim() ||
              rosterDraft.trim() !== (m.rosterName ?? "").trim() ||
              !sameSet(positionsDraft, m.positions);
            return (
              <tr key={m.canonicalId}>
                <td>
                  <input
                    type="text"
                    className="login-form-input"
                    value={displayDraft}
                    disabled={isPending}
                    onChange={(e) => setDisplayNameDrafts((d) => ({ ...d, [m.canonicalId]: e.target.value }))}
                    aria-label={`Display name for ${m.displayName}`}
                  />
                </td>
                <td>{m.email}</td>
                <td>
                  <input
                    type="text"
                    className="login-form-input"
                    value={rosterDraft}
                    disabled={isPending}
                    onChange={(e) => setRosterNameDrafts((d) => ({ ...d, [m.canonicalId]: e.target.value }))}
                    aria-label={`Roster name for ${m.displayName}`}
                  />
                </td>
                <td>
                  <div className="member-positions-editor">
                    {POSITIONS.map((position) => (
                      <button
                        key={position}
                        type="button"
                        className={
                          positionsDraft.includes(position) ? "position-pill position-pill-active" : "position-pill"
                        }
                        disabled={isPending}
                        onClick={() => togglePosition(m.canonicalId, positionsDraft, position)}
                        aria-pressed={positionsDraft.includes(position)}
                      >
                        {position}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="num">
                  <button
                    type="button"
                    className="checkin-edit-save"
                    disabled={isPending || !changed || !displayDraft.trim() || !rosterDraft.trim()}
                    onClick={() => handleSaveMember(m, displayDraft, rosterDraft, positionsDraft)}
                  >
                    Save
                  </button>
                </td>
                <td className="num">
                  <input
                    type="checkbox"
                    checked={m.isAdmin}
                    disabled={isPending || m.canonicalId === currentCanonicalId}
                    onChange={(e) => handleToggleAdmin(m.canonicalId, e.target.checked)}
                    aria-label={`${m.displayName} is admin`}
                  />
                </td>
                <td className="num">
                  <button
                    type="button"
                    className="checkin-edit-remove"
                    disabled={isPending}
                    onClick={() => handleToggleRemoved(m.canonicalId, m.displayName, !m.isRemoved)}
                  >
                    {m.isRemoved ? "Restore" : "Remove"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
