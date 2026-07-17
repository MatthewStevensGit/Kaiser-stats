"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeMember, restoreMember, setMemberAdmin } from "@/lib/auth/actions";
import type { MemberRow } from "@/lib/auth/members-data";

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

  function handleToggleAdmin(canonicalId: string, nextIsAdmin: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setMemberAdmin(canonicalId, nextIsAdmin);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  function handleToggleRemoved(canonicalId: string, nextIsRemoved: boolean) {
    setError(null);
    startTransition(async () => {
      const result = nextIsRemoved ? await removeMember(canonicalId) : await restoreMember(canonicalId);
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
            <th>Name</th>
            <th>Email</th>
            <th className="num">Admin</th>
            <th className="num">Status</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.canonicalId}>
              <td>{m.displayName}</td>
              <td>{m.email}</td>
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
                  onClick={() => handleToggleRemoved(m.canonicalId, !m.isRemoved)}
                >
                  {m.isRemoved ? "Restore" : "Remove"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
