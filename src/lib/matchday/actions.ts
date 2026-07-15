"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createProvisionalIdentity } from "@/lib/stats-engine/identity";
import { createServiceRoleClient } from "@/lib/supabase/client";
import type { MatchdayActionResult } from "./types";

const UNIQUE_VIOLATION = "23505";

function revalidateGamePaths(gameId: string) {
  revalidatePath("/matchday");
  revalidatePath(`/matchday/${gameId}`);
  revalidatePath(`/matchday/${gameId}/edit`);
}

/**
 * Every action here independently re-checks admin-ness. Server Actions
 * compile to a callable endpoint reachable regardless of which page's JSX
 * references them — this must never be assumed safe just because only the
 * requireAdmin()-gated edit page currently links to it (see session.ts).
 */
async function requireAdminResult(): Promise<{ canonicalId: string } | MatchdayActionResult> {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return { ok: false, error: "Admin access required." };
  return admin;
}

export async function checkInExistingPlayer(
  gameId: string,
  canonicalId: string,
): Promise<MatchdayActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const client = createServiceRoleClient();

  const { data: existing } = await client
    .from("game_checkins")
    .select("id")
    .eq("game_id", gameId)
    .eq("canonical_id", canonicalId)
    .is("removed_at", null)
    .maybeSingle();

  if (existing) return { ok: false, error: "Already checked in." };

  const { error } = await client.from("game_checkins").insert({
    game_id: gameId,
    canonical_id: canonicalId,
    checked_in_by: admin.canonicalId,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, error: "Already checked in." };
    return { ok: false, error: "Could not check in that player." };
  }

  revalidateGamePaths(gameId);
  return { ok: true };
}

export async function checkInNewPlayer(gameId: string, rawName: string): Promise<MatchdayActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const trimmed = rawName.trim();
  if (!trimmed) return { ok: false, error: "Name can't be empty." };

  const client = createServiceRoleClient();

  const { data: game } = await client
    .from("scheduled_games")
    .select("league")
    .eq("game_id", gameId)
    .maybeSingle();
  if (!game) return { ok: false, error: "Game not found." };

  const provisional = createProvisionalIdentity(trimmed);

  const { data: existingPlayer } = await client
    .from("players")
    .select("canonical_id")
    .eq("canonical_id", provisional.canonicalId)
    .maybeSingle();

  if (!existingPlayer) {
    const { error: insertPlayerError } = await client.from("players").insert({
      canonical_id: provisional.canonicalId,
      display_name: provisional.displayName,
      aliases: provisional.aliases,
      known_emails: provisional.knownEmails,
      leagues: [game.league],
      status: provisional.status,
    });
    if (insertPlayerError) return { ok: false, error: "Could not create that player." };
  }

  return checkInExistingPlayer(gameId, provisional.canonicalId);
}

/**
 * Plain-<form>-compatible wrapper: form `action` props must return void, but
 * removeCheckIn() returns a result for callers that need to show an error
 * (e.g. a future client-driven remove button). The edit page's simple
 * per-row remove form has nowhere to show that result anyway, so it just
 * discards it here.
 */
export async function removeCheckInFormAction(gameId: string, canonicalId: string): Promise<void> {
  await removeCheckIn(gameId, canonicalId);
}

export async function removeCheckIn(gameId: string, canonicalId: string): Promise<MatchdayActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const client = createServiceRoleClient();

  const { data, error } = await client
    .from("game_checkins")
    .update({ removed_at: new Date().toISOString(), removed_by: admin.canonicalId })
    .eq("game_id", gameId)
    .eq("canonical_id", canonicalId)
    .is("removed_at", null)
    .select("id");

  if (error) return { ok: false, error: "Could not remove that check-in." };
  if (!data || data.length === 0) return { ok: false, error: "Not currently checked in." };

  revalidateGamePaths(gameId);
  return { ok: true };
}
