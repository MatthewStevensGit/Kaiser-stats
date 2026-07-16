"use server";

import { createProvisionalIdentityFromEmail, findPlayerByEmail } from "../stats-engine/identity";
import type { PlayerIdentity } from "../stats-engine/types";
import { createServiceRoleClient } from "../supabase/client";
import { createServerSupabaseClient } from "../supabase/server-client";

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

/**
 * Runs right after the browser confirms a 6-digit login code
 * (supabase.auth.verifyOtp) — links the now-authenticated auth user to a
 * players row: an existing player's first login gets their row linked by
 * email match, a never-seen email gets auto-provisioned (never blocked —
 * same never-guess-a-merge philosophy as report/spreadsheet name
 * resolution; see identity.ts). Idempotent — a returning user with an
 * already-linked row is a no-op.
 */
export async function linkPlayerAfterLogin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { ok: false, error: "Not signed in." };

  const authUserId = user.id;
  const email = user.email;
  const serviceRoleClient = createServiceRoleClient();

  const { data: existingByAuthId } = await serviceRoleClient
    .from("players")
    .select("canonical_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (existingByAuthId) return { ok: true };

  const { data: allPlayers } = await serviceRoleClient
    .from("players")
    .select("canonical_id, display_name, aliases, known_emails, leagues, status");

  const match = findPlayerByEmail((allPlayers ?? []).map(toPlayerIdentity), email);

  if (match) {
    const { error } = await serviceRoleClient
      .from("players")
      .update({ auth_user_id: authUserId })
      .eq("canonical_id", match.canonicalId);
    if (error) return { ok: false, error: "Could not finish signing you in." };
    return { ok: true };
  }

  const provisional = createProvisionalIdentityFromEmail(email);
  const { error } = await serviceRoleClient.from("players").insert({
    canonical_id: provisional.canonicalId,
    display_name: provisional.displayName,
    aliases: provisional.aliases,
    known_emails: provisional.knownEmails,
    leagues: provisional.leagues,
    status: provisional.status,
    auth_user_id: authUserId,
  });
  if (error) return { ok: false, error: "Could not finish signing you in." };
  return { ok: true };
}
