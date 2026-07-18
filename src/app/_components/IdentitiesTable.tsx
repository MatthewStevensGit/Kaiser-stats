"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMemberRosterName } from "@/lib/auth/actions";
import type { MemberRow } from "@/lib/auth/members-data";

export function IdentitiesTable({ members }: { members: MemberRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave(canonicalId: string) {
    const value = drafts[canonicalId];
    if (value === undefined) return;
    setError(null);
    startTransition(async () => {
      const result = await setMemberRosterName(canonicalId, value);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
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
            <th className="num"></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const draft = drafts[m.canonicalId] ?? m.rosterName ?? "";
            const changed = draft.trim() !== (m.rosterName ?? "").trim();
            return (
              <tr key={m.canonicalId}>
                <td>{m.displayName}</td>
                <td>{m.email}</td>
                <td>
                  <input
                    type="text"
                    className="login-form-input"
                    value={draft}
                    disabled={isPending}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.canonicalId]: e.target.value }))}
                    aria-label={`Roster name for ${m.displayName}`}
                  />
                </td>
                <td className="num">
                  <button
                    type="button"
                    className="checkin-edit-remove"
                    disabled={isPending || !changed || !draft.trim()}
                    onClick={() => handleSave(m.canonicalId)}
                  >
                    Save
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
