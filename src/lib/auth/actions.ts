"use server";

import { revalidatePath } from "next/cache";
import {
  createProvisionalIdentityFromEmail,
  findPlayerByEmail,
  resolveOnboardingRosterName,
  type OnboardingRosterCheckPlayer,
} from "../stats-engine/identity";
import { isPosition, type Position } from "../stats-engine/positions";
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

/** Drops anything that isn't one of the 9 known codes and dedupes — never trusts client input directly into a text[] column. */
function sanitizePositions(raw: string[]): Position[] {
  return Array.from(new Set(raw.filter(isPosition)));
}

type LinkPlayerResult = { ok: true; needsOnboarding: boolean } | { ok: false; error: string };

/**
 * Runs right after the browser establishes a real Supabase session —
 * either a verified 6-digit code (supabase.auth.verifyOtp, signup/forgot-
 * password) or a successful password login (signInWithPassword) — links the
 * now-authenticated auth user to a players row: an existing player's first
 * login gets their row linked by email match, a never-seen email gets
 * auto-provisioned (never blocked — same never-guess-a-merge philosophy as
 * report/spreadsheet name resolution; see identity.ts). Idempotent — a
 * returning user with an already-linked row is a no-op. `needsOnboarding`
 * tells the caller whether to route to /onboarding (display name, roster
 * name, and password, all required) instead of straight to / — true for a
 * brand-new row, or an existing historical row logging in for the first
 * time (both start with onboarding_completed_at null; see the schema
 * migration's backfill for why already-established members are
 * grandfathered past this).
 */
export async function linkPlayerAfterLogin(): Promise<LinkPlayerResult> {
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
    .select("onboarding_completed_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (existingByAuthId) {
    // Revalidated here, server-side and authoritative, rather than leaving
    // the client to call router.refresh() right after its own router.push()
    // — that combination raced against itself and could leave the login
    // button stuck on its pending label even after login had genuinely
    // already succeeded (see login/page.tsx's afterVerifiedSession).
    revalidatePath("/");
    return { ok: true, needsOnboarding: existingByAuthId.onboarding_completed_at === null };
  }

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
    revalidatePath("/");
    return { ok: true, needsOnboarding: true };
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
  revalidatePath("/");
  return { ok: true, needsOnboarding: true };
}

interface OtherPlayerRow {
  canonical_id: string;
  display_name: string;
  roster_name: string | null;
  aliases: string[] | null;
  known_emails: string[] | null;
  leagues: string[] | null;
  status: PlayerIdentity["status"];
  auth_user_id: string | null;
}

/**
 * Sets BOTH names at once, required together — the caller's own row only
 * (re-derived from their session, never a client-passed canonicalId, same
 * pattern as updateDisplayName below). This is the only place a non-admin
 * can ever write roster_name: once onboarding_completed_at is set here, the
 * user has no further self-service way to change it — only an admin can,
 * via setMemberRosterName below (Settings > Members).
 */
export async function completeOnboarding(
  displayName: string,
  rosterName: string,
  password: string | null,
  positions: string[] = [],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmedDisplayName = displayName.trim();
  const trimmedRosterName = rosterName.trim();
  if (!trimmedDisplayName) return { ok: false, error: "Display name can't be empty." };
  if (!trimmedRosterName) return { ok: false, error: "Roster name can't be empty." };
  if (password !== null && password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const cleanPositions = sanitizePositions(positions);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const serviceRoleClient = createServiceRoleClient();

  const { data: ownRow } = await serviceRoleClient
    .from("players")
    .select("canonical_id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!ownRow) return { ok: false, error: "Could not find your account." };

  const { data: othersData } = await serviceRoleClient
    .from("players")
    .select("canonical_id, display_name, roster_name, aliases, known_emails, leagues, status, auth_user_id")
    .neq("canonical_id", ownRow.canonical_id);
  const others: OnboardingRosterCheckPlayer[] = ((othersData ?? []) as OtherPlayerRow[]).map((row) => ({
    canonicalId: row.canonical_id,
    displayName: row.display_name,
    rosterName: row.roster_name,
    aliases: row.aliases ?? [],
    knownEmails: row.known_emails ?? [],
    leagues: (row.leagues ?? []) as PlayerIdentity["leagues"],
    status: row.status,
    authUserId: row.auth_user_id,
  }));

  const check = resolveOnboardingRosterName(ownRow.canonical_id, ownRow.status, trimmedRosterName, others);
  if (check.outcome === "error") return { ok: false, error: check.error };

  // Set the password BEFORE any players-table write: if this fails, nothing
  // else has been touched yet, so the whole form can just be resubmitted
  // cleanly. Doing it after the merge/update below would risk a completed,
  // merged, onboarding_completed_at-stamped account with no password set —
  // recoverable via "log in with a code" + Settings, but confusing enough to
  // avoid outright. `password` is null for anyone who already set one via
  // /signup (supabase.auth.signUp already required it there) — nothing to do.
  if (password !== null) {
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) return { ok: false, error: passwordError.message };
  }

  if (check.outcome === "merge") {
    // Reunite the stub with the real historical identity — delete-then-update
    // (never both rows holding auth_user_id at once) since auth_user_id is
    // unique (see schema.sql). The stub was only ever created moments ago at
    // login, before onboarding gates every other page, so it can't yet have
    // accumulated any real foreign-key references.
    const { error: deleteError } = await serviceRoleClient
      .from("players")
      .delete()
      .eq("canonical_id", ownRow.canonical_id);
    if (deleteError) return { ok: false, error: "Could not save your profile." };

    const { error: updateError } = await serviceRoleClient
      .from("players")
      .update({
        auth_user_id: user.id,
        display_name: trimmedDisplayName,
        roster_name: trimmedRosterName,
        positions: cleanPositions,
        onboarding_completed_at: new Date().toISOString(),
        status: "regular",
      })
      .eq("canonical_id", check.targetCanonicalId);
    if (updateError) return { ok: false, error: "Could not save your profile." };
    revalidatePath("/");
    return { ok: true };
  }

  const { error } = await serviceRoleClient
    .from("players")
    .update({
      display_name: trimmedDisplayName,
      roster_name: trimmedRosterName,
      positions: cleanPositions,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("auth_user_id", user.id);
  if (error) return { ok: false, error: "Could not save your profile." };
  revalidatePath("/");
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
 * Updates the CALLER's own playable positions — unlike roster_name, this stays
 * editable by the member themselves any time (Settings), not just once at
 * onboarding: it's a preference, not an identity-integrity concern, so there's
 * no risk in letting someone correct it later as they actually figure out
 * where they like to play.
 */
export async function updateOwnPositions(
  positions: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const serviceRoleClient = createServiceRoleClient();
  const { error } = await serviceRoleClient
    .from("players")
    .update({ positions: sanitizePositions(positions) })
    .eq("auth_user_id", user.id);
  if (error) return { ok: false, error: "Could not update your positions." };
  return { ok: true };
}

const MIN_PASSWORD_LENGTH = 8;

/**
 * Sets the CALLER's own password — used both at first-time signup (right
 * after the onboarding code verification) and from Settings' "Change
 * password" for anyone who already has one. Supabase's own session (read via
 * cookies, same as every other self-service action here) is what
 * authorizes this — no separate re-entry of the old password, since this
 * app's user base is small and trusted enough that the added friction isn't
 * worth it, same reasoning as updateOwnPositions above.
 */
export async function setOwnPassword(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
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

/**
 * The only way to change roster_name once a user has completed onboarding
 * (see completeOnboarding above) — corrects mismatches from the
 * email-match/auto-provision step at login, or a typo the user made at
 * onboarding time. Settings > Members.
 */
export async function setMemberRosterName(
  canonicalId: string,
  rosterName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const trimmed = rosterName.trim();
  if (!trimmed) return { ok: false, error: "Roster name can't be empty." };

  const client = createServiceRoleClient();
  const { error } = await client.from("players").update({ roster_name: trimmed }).eq("canonical_id", canonicalId);
  if (error) return { ok: false, error: "Could not update that member's roster name." };

  revalidatePath("/settings/members");
  return { ok: true };
}

/**
 * Admin-only rename of ANOTHER member's display name — distinct from
 * updateDisplayName() above, which only ever lets someone rename themselves.
 * display_name is otherwise a private, personal login preference (never
 * shown to anyone but its owner elsewhere in the app); this exists purely so
 * an admin can fix an obviously wrong/confusing one on someone else's behalf
 * (e.g. an auto-provisioned stub still showing a raw email). Settings > Members.
 */
export async function setMemberDisplayName(
  canonicalId: string,
  displayName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const trimmed = displayName.trim();
  if (!trimmed) return { ok: false, error: "Display name can't be empty." };

  const client = createServiceRoleClient();
  const { error } = await client.from("players").update({ display_name: trimmed }).eq("canonical_id", canonicalId);
  if (error) return { ok: false, error: "Could not update that member's display name." };

  revalidatePath("/settings/members");
  return { ok: true };
}

/**
 * Admin-set positions for ANOTHER member — for filling in a teammate's
 * playable positions when the admin knows them but that person hasn't set it
 * themselves (e.g. an older account from before this feature existed).
 * Settings > Members.
 */
export async function setMemberPositions(
  canonicalId: string,
  positions: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const client = createServiceRoleClient();
  const { error } = await client
    .from("players")
    .update({ positions: sanitizePositions(positions) })
    .eq("canonical_id", canonicalId);
  if (error) return { ok: false, error: "Could not update that member's positions." };

  revalidatePath("/settings/members");
  return { ok: true };
}
