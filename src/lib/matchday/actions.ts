"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createProvisionalIdentity } from "@/lib/stats-engine/identity";
import { createServiceRoleClient } from "@/lib/supabase/client";
import { getRegistrationStatus } from "./registration-window";
import type { MatchdayActionResult, ScheduledLeague } from "./types";

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

/**
 * Self-service check-in — any logged-in player checking THEMSELVES in, not
 * an admin action. Re-derives who's asking from their own auth session
 * (never a client-passed canonicalId) and independently re-verifies
 * registration is actually open server-side (never trusts the button
 * merely being rendered, in case of a stale page).
 */
export async function checkInSelf(gameId: string): Promise<MatchdayActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const client = createServiceRoleClient();

  const { data: game } = await client
    .from("scheduled_games")
    .select("date, league, cancelled_at")
    .eq("game_id", gameId)
    .maybeSingle();
  if (!game) return { ok: false, error: "Game not found." };
  if (game.cancelled_at) return { ok: false, error: "This game has been cancelled." };

  const status = getRegistrationStatus(new Date(), game.date, game.league as ScheduledLeague);
  if (status !== "open") return { ok: false, error: "Registration isn't open for this game." };

  const { error } = await client.from("game_checkins").insert({
    game_id: gameId,
    canonical_id: user.canonicalId,
    checked_in_by: user.canonicalId,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, error: "Already checked in." };
    return { ok: false, error: "Could not check you in." };
  }

  revalidateGamePaths(gameId);
  return { ok: true };
}

/** Self-service cancel — a player removing their own check-in, same re-derivation as checkInSelf(). */
export async function cancelSelfCheckIn(gameId: string): Promise<MatchdayActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const client = createServiceRoleClient();

  const { data, error } = await client
    .from("game_checkins")
    .update({ removed_at: new Date().toISOString(), removed_by: user.canonicalId })
    .eq("game_id", gameId)
    .eq("canonical_id", user.canonicalId)
    .is("removed_at", null)
    .select("id");

  if (error) return { ok: false, error: "Could not cancel your check-in." };
  if (!data || data.length === 0) return { ok: false, error: "Not currently checked in." };

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

/** Plain-<form>-compatible wrapper, same reasoning as removeCheckInFormAction. */
export async function cancelScheduledGameFormAction(gameId: string): Promise<void> {
  await cancelScheduledGame(gameId);
}

export async function cancelScheduledGame(gameId: string): Promise<MatchdayActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const client = createServiceRoleClient();

  const { data, error } = await client
    .from("scheduled_games")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: admin.canonicalId })
    .eq("game_id", gameId)
    .is("cancelled_at", null)
    .select("game_id");

  if (error) return { ok: false, error: "Could not cancel that game." };
  if (!data || data.length === 0) {
    return { ok: false, error: "Game not found or already cancelled." };
  }

  revalidateGamePaths(gameId);
  return { ok: true };
}

export async function createOneOffGame(input: {
  date: string;
  league: ScheduledLeague;
  kickoffLabel: string;
  venue: string;
}): Promise<MatchdayActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const date = input.date.trim();
  const kickoffLabel = input.kickoffLabel.trim();
  const venue = input.venue.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Enter a valid date." };
  if (!kickoffLabel) return { ok: false, error: "Kickoff time can't be empty." };
  if (!venue) return { ok: false, error: "Venue can't be empty." };
  if (input.league !== "saturday" && input.league !== "sunday") {
    return { ok: false, error: "Choose a league." };
  }

  // Distinct id scheme from the cron's `matchday-<date>` (recurring games are
  // always unique-per-date already) so a one-off game can't collide with a
  // same-date-different-league recurring row.
  const gameId = `matchday-${date}-${input.league}`;

  const client = createServiceRoleClient();
  const { error } = await client.from("scheduled_games").insert({
    game_id: gameId,
    date,
    league: input.league,
    kickoff_label: kickoffLabel,
    venue,
    is_recurring: false,
    created_by: admin.canonicalId,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "A game already exists on that date/league." };
    }
    return { ok: false, error: "Could not create that game." };
  }

  revalidatePath("/matchday");
  revalidatePath(`/matchday/${gameId}`);
  return { ok: true };
}
