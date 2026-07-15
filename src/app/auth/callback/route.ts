import { NextResponse } from "next/server";
import { createProvisionalIdentityFromEmail, findPlayerByEmail } from "@/lib/stats-engine/identity";
import type { PlayerIdentity } from "@/lib/stats-engine/types";
import { createServiceRoleClient } from "@/lib/supabase/client";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

interface PlayerRow {
  canonical_id: string;
  display_name: string;
  aliases: string[];
  known_emails: string[];
  leagues: string[];
  status: PlayerIdentity["status"];
}

function toPlayerIdentity(row: PlayerRow): PlayerIdentity {
  return {
    canonicalId: row.canonical_id,
    displayName: row.display_name,
    aliases: row.aliases,
    knownEmails: row.known_emails,
    leagues: row.leagues as PlayerIdentity["leagues"],
    status: row.status,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user?.email) {
    return NextResponse.redirect(new URL("/login?error=exchange_failed", url.origin));
  }

  const authUserId = data.user.id;
  const email = data.user.email;

  const serviceRoleClient = createServiceRoleClient();

  // Returning user: already linked to a players row.
  const { data: existingByAuthId } = await serviceRoleClient
    .from("players")
    .select("canonical_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!existingByAuthId) {
    const { data: allPlayers } = await serviceRoleClient
      .from("players")
      .select("canonical_id, display_name, aliases, known_emails, leagues, status");

    const match = findPlayerByEmail((allPlayers ?? []).map(toPlayerIdentity), email);

    if (match) {
      // Existing player's first login — link their row.
      await serviceRoleClient
        .from("players")
        .update({ auth_user_id: authUserId })
        .eq("canonical_id", match.canonicalId);
    } else {
      // Never-seen email — auto-provision, never block. Same
      // never-guess-a-merge philosophy as name resolution: a human can
      // reconcile this with an existing player later if needed.
      const provisional = createProvisionalIdentityFromEmail(email);
      await serviceRoleClient.from("players").insert({
        canonical_id: provisional.canonicalId,
        display_name: provisional.displayName,
        aliases: provisional.aliases,
        known_emails: provisional.knownEmails,
        leagues: provisional.leagues,
        status: provisional.status,
        auth_user_id: authUserId,
      });
    }
  }

  return NextResponse.redirect(new URL("/", url.origin));
}
