import { createServiceRoleClient } from "../supabase/client";

export interface MemberRow {
  canonicalId: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  isRemoved: boolean;
}

/**
 * Everyone who has actually logged in (auth_user_id set — see
 * linkPlayerAfterLogin in actions.ts), not every player row: most rows are
 * backfilled from spreadsheets/reports and never had a real account. Plain
 * server-only data function, not a Server Action — this is read-only and
 * only ever called from the Settings > Members Server Component page, no
 * reason to expose it as a client-callable endpoint.
 */
export async function listMembers(): Promise<MemberRow[]> {
  const client = createServiceRoleClient();
  const { data } = await client
    .from("players")
    .select("canonical_id, display_name, known_emails, is_admin, status")
    .not("auth_user_id", "is", null)
    .order("display_name", { ascending: true });

  return (data ?? []).map((row) => ({
    canonicalId: row.canonical_id,
    displayName: row.display_name,
    email: row.known_emails?.[0] ?? "",
    isAdmin: row.is_admin,
    isRemoved: row.status === "deferred",
  }));
}
