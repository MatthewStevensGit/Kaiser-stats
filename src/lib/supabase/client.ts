import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side-only Supabase client, using the service_role key. Never
 * imported by a Client Component — used by local/private tooling (the
 * backfill script), the auth callback route, and Matchday's server-only data
 * layer (src/lib/matchday/data.ts, src/lib/matchday/actions.ts). Table/Past
 * Matches/Player Detail still read data/sample/ regardless of whether these
 * env vars are set; see docs/data-contract.md's "Going live with real data"
 * section for which parts of the site have and haven't made that call.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example). " +
        "This client is for local/private scripts only — it should never run in the deployed app.",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
