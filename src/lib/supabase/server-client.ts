import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client that reads/refreshes the caller's own auth
 * session cookie — for use in Server Components and Route Handlers. Still
 * the anon key: it only ever answers "is there a valid session, and whose,"
 * never a players-table query (that always goes through
 * createServiceRoleClient() in ./client.ts instead).
 */
export async function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example).",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server Components can't set cookies — this throws there and is a
        // no-op by design; the middleware (src/proxy.ts) is what actually
        // persists refreshed session cookies on every request. Route
        // Handlers and Server Actions run in a context where this succeeds
        // normally.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render — safe to ignore.
        }
      },
    },
  });
}
