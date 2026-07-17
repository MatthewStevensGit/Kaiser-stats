"use server";

import { revalidatePath } from "next/cache";
import { createProvisionalIdentityFromEmail, findPlayerByEmail } from "../stats-engine/identity";
import type { PlayerIdentity } from "../stats-engine/types";
import { createServiceRoleClient } from "../supabase/client";
import { createServerSupabaseClient } from "../supabase/server-client";
import { getCurrentUser } from "./session";

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

/**
 * Renames the CALLER's own players row — re-derives who's asking from their
 * own auth session server-side (never trusts a client-passed canonicalId),
 * same "independently re-check, don't trust the caller" pattern as every
 * other Server Action in this app (see e.g. src/lib/matchday/actions.ts).
 */
export async function updateDisplayName(
  newDisplayName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = newDisplayName.trim();
  if (!trimmed) return { ok: false, error: "Name can't be empty." };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const serviceRoleClient = createServiceRoleClient();
  const { error } = await serviceRoleClient
    .from("players")
    .update({ display_name: trimmed })
    .eq("auth_user_id", user.id);
  if (error) return { ok: false, error: "Could not update your name." };
  return { ok: true };
}

/**
 * Every action below independently re-checks admin-ness — Server Actions are
 * reachable regardless of which page's JSX references them, same reasoning
 * as requireAdminResult() in src/lib/matchday/actions.ts (not shared across
 * modules, matching that file's existing convention).
 */
async function requireAdminResult(): Promise<{ canonicalId: string } | { ok: false; error: string }> {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return { ok: false, error: "Admin access required." };
  return admin;
}

/**
 * Toggles another member's admin flag. Blocks self-demotion (removing your
 * OWN admin status) — this app has only a single is_admin boolean, no
 * fuller role model, so an admin accidentally de-adminning themselves with
 * no one else to fix it would be a real lockout risk.
 */
export async function setMemberAdmin(
  canonicalId: string,
  isAdmin: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;
  if (canonicalId === admin.canonicalId && !isAdmin) {
    return { ok: false, error: "You can't remove your own admin access." };
  }

  const client = createServiceRoleClient();
  const { error } = await client.from("players").update({ is_admin: isAdmin }).eq("canonical_id", canonicalId);
  if (error) return { ok: false, error: "Could not update that member's admin status." };

  revalidatePath("/settings/members");
  return { ok: true };
}

/**
 * "Kicking someone out of the league" sets their status to 'deferred' — the
 * same status getRosterForPicker() already excludes from check-in/draft
 * pools (see src/lib/matchday/data.ts) — rather than deleting their row,
 * which would orphan their historical stats (roster_spots/goal_events
 * reference their canonical_id) and violate auth_user_id's foreign key.
 * Reversible via restoreMember below.
 */
export async function removeMember(canonicalId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const client = createServiceRoleClient();
  const { error } = await client.from("players").update({ status: "deferred" }).eq("canonical_id", canonicalId);
  if (error) return { ok: false, error: "Could not remove that member." };

  revalidatePath("/settings/members");
  return { ok: true };
}

export async function restoreMember(canonicalId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const client = createServiceRoleClient();
  const { error } = await client.from("players").update({ status: "regular" }).eq("canonical_id", canonicalId);
  if (error) return { ok: false, error: "Could not restore that member." };

  revalidatePath("/settings/members");
  return { ok: true };
}
