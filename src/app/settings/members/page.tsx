import { requireAdmin } from "@/lib/auth/session";
import { listMembers } from "@/lib/auth/members-data";
import { MembersTable } from "../../_components/MembersTable";

// Real Supabase-backed data — must never be cached or prerendered at build time.
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const admin = await requireAdmin("/settings");
  const members = await listMembers();

  return (
    <main>
      <a href="/settings" className="back-link">
        ← Back to settings
      </a>
      <header className="screen-header-row">
        <h1 className="screen-header">Members</h1>
      </header>
      <p className="note">Everyone who has actually logged in, with their name and email.</p>

      <MembersTable members={members} currentCanonicalId={admin.canonicalId} />
    </main>
  );
}
