import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client, using the anon/public key. Safe to ship to
 * the client: this client only ever performs the Supabase Auth handshake
 * (signInWithOtp, reading its own session) — it never reads player data
 * directly. Every players-table lookup in this app happens server-side via
 * createServiceRoleClient() (./client.ts), because every table has RLS
 * enabled with no public policies (see supabase/schema.sql) and this app
 * deliberately never adds a public policy to change that.
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example).",
    );
  }

  return createBrowserClient(url, key);
}
