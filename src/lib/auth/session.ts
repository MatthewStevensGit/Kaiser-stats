import { createServiceRoleClient } from "@/lib/supabase/client";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

export interface CurrentUser {
  canonicalId: string;
  displayName: string;
  isAdmin: boolean;
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
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
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
  };
}
