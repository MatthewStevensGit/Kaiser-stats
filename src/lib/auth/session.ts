import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/client";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

export interface CurrentUser {
  canonicalId: string;
  displayName: string;
  isAdmin: boolean;
  email: string;
}

interface PlayerRow {
  canonical_id: string;
  display_name: string;
  is_admin: boolean;
}

/**
 * Who's logged in right now, if anyone. Narrow, stable shape — same
 * "small contract, not the full row" philosophy as PlayerSeasonStats (see
 * docs/data-contract.md) — future slices import this, not the raw players
 * row shape.
 *
 * Called from the root layout on every single page, so any error here
 * (missing env vars, Supabase briefly unreachable, etc.) must degrade to
 * "not logged in" rather than throwing — otherwise a transient auth/config
 * problem would take down the entire site, not just personalization. Real
 * admin actions still independently re-check inside each Server Action
 * (see src/lib/matchday/actions.ts), so treating an error as "no user" here
 * never grants access by accident, it only ever hides logged-in-only UI.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const serviceRoleClient = createServiceRoleClient();
    const { data } = await serviceRoleClient
      .from("players")
      .select("canonical_id, display_name, is_admin")
      .eq("auth_user_id", user.id)
      .maybeSingle<PlayerRow>();

    if (!data) return null;

    return {
      canonicalId: data.canonical_id,
      displayName: data.display_name,
      isAdmin: data.is_admin,
      email: user.email ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Gates a Server Component page to admins only — not logged in goes to
 * /login, logged in but not admin bounces to fallbackPath (the specific
 * page's own public equivalent, not a generic one). Uses redirect()'s
 * Next.js control-flow throw, so only for pages — Server Actions can't rely
 * on this (they're callable independent of which page renders them) and
 * must re-check getCurrentUser() themselves instead; see
 * src/lib/matchday/actions.ts.
 */
export async function requireAdmin(fallbackPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect(fallbackPath);
  return user;
}
