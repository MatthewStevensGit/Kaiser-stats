import { requireAdmin } from "@/lib/auth/session";
import { listMembers } from "@/lib/auth/members-data";
import { BackLink } from "../../_components/BackLink";
import { IdentitiesTable } from "../../_components/IdentitiesTable";

// Real Supabase-backed data — must never be cached or prerendered at build time.
export const dynamic = "force-dynamic";

export default async function IdentitiesPage() {
  await requireAdmin("/settings");
  const members = await listMembers();

  return (
    <main>
      <BackLink fallbackHref="/settings" />
      <header className="screen-header-row">
        <h1 className="screen-header">Identities</h1>
      </header>
      <p className="note">
        Match each member&apos;s login to the name used in game reports — this is what
        shows during a live draft, not their display name.
      </p>

      <IdentitiesTable members={members} />
    </main>
  );
}
