import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side-only Supabase client, using the service_role key. Nothing in
 * src/app/ (the public site) imports this — it exists for local/private
 * tooling (the backfill script) only. The public demo pages keep reading
 * data/sample/ regardless of whether these env vars are set; see
 * docs/data-contract.md's "Going live with real data" section.
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
