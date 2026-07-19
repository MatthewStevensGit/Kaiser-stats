"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { draftGameId, saveResolvedGame } from "@/lib/report-parser/save";
import { listGameRecords, listPlayers } from "@/lib/stats-engine/data";
import { rollupGameRecords } from "@/lib/stats-engine/game-records";
import { rosterDisplayName } from "@/lib/stats-engine/identity";
import type { GameRecord } from "@/lib/stats-engine/types";
import { createServiceRoleClient } from "@/lib/supabase/client";
import { getScheduledGameById } from "./data";
import { buildDefaultTurnSizes, expandTurnsToSides, parseManualTurnSizes } from "./draft-order";
import type { DraftSide } from "./draft-order";
import type { PickHistoryEntry } from "./adr-window";
import { countFilledGroups, isPositionallyNeeded } from "./position-need";
import type { ScheduledLeague } from "./types";
import type { Position } from "@/lib/stats-engine/positions";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Same independent-admin-recheck pattern as every other action in matchday/actions.ts. */
async function requireAdminResult(): Promise<{ canonicalId: string } | ActionResult> {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return { ok: false, error: "Admin access required." };
  return admin;
}

interface DraftSessionRow {
  id: number;
  game_id: string;
  league: ScheduledLeague;
  status: "setup" | "in_progress" | "completed";
  home_captain_canonical_id: string | null;
  away_captain_canonical_id: string | null;
  first_pick_side: DraftSide | null;
  pool_canonical_ids: string[];
  turn_sizes: number[] | null;
}

interface DraftPickRow {
  pick_number: number;
  side: DraftSide;
  canonical_id: string;
}

/** Avg draft position scoped three ways — captains draft for one specific league, but want to see how a player has gone in the other league too. */
export interface DraftPositionByLeague {
  saturday: number | null;
  sunday: number | null;
  both: number | null;
}

export interface RecommendedPlayer {
  canonicalId: string;
  displayName: string;
  avgDraftPosition: DraftPositionByLeague;
  positions: Position[];
  /** False once every position this player plays is already filled on the CURRENTLY-drafting side — see position-need.ts. Always true for a player with no listed positions (unknown, never penalized). */
  positionallyNeeded: boolean;
}

export interface DraftSessionState {
  id: number;
  gameId: string;
  league: ScheduledLeague;
  status: "setup" | "in_progress" | "completed";
  homeCaptainId: string | null;
  awayCaptainId: string | null;
  firstPickSide: DraftSide | null;
  poolCanonicalIds: string[];
  turnSizes: number[] | null;
  picks: { pickNumber: number; side: DraftSide; canonicalId: string }[];
  /** Undrafted, non-captain pool members, ranked lowest avgDraftPosition first (nulls last). */
  remainingRanked: RecommendedPlayer[];
  currentSide: DraftSide | null;
  /** Each remaining player's own past draft-pick history (date/league/pick number) — lets the client recompute a time-windowed ADR (Last Month/3 Months/etc.) instantly, with no extra round trip. See adr-window.ts. */
  pickHistory: PickHistoryEntry[];
}

function revalidateDraftPaths(gameId: string) {
  revalidatePath(`/matchday/${gameId}`);
  revalidatePath(`/matchday/${gameId}/draft`);
}

async function fetchLatestSession(gameId: string): Promise<DraftSessionRow | null> {
  const client = createServiceRoleClient();
  const { data } = await client
    .from("draft_sessions")
    .select(
      "id, game_id, league, status, home_captain_canonical_id, away_captain_canonical_id, first_pick_side, pool_canonical_ids, turn_sizes",
    )
    .eq("game_id", gameId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as DraftSessionRow | null) ?? null;
}

/** The pool minus its 2 captains — what's actually left to draft, pick-sequence math is relative to this. */
function remainingCountFor(session: DraftSessionRow): number {
  const captains = [session.home_captain_canonical_id, session.away_captain_canonical_id].filter(
    (id): id is string => id !== null,
  );
  return session.pool_canonical_ids.filter((id) => !captains.includes(id)).length;
}

export async function startDraftSetup(gameId: string): Promise<ActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const game = await getScheduledGameById(gameId);
  if (!game) return { ok: false, error: "Game not found." };
  if (game.cancelled) return { ok: false, error: "This game has been cancelled." };

  // No registration-status gate here on purpose — an admin can start a
  // draft for a game whenever they want (testing, an early practice run, or
  // just wanting to get ahead of it), regardless of whether registration has
  // opened, is still open, or has closed. This is admin-only already
  // (requireAdminResult above); the pool is pre-filled from whoever's
  // checked in so far and can always be edited before Begin Draft.
  const client = createServiceRoleClient();
  const { error } = await client.from("draft_sessions").insert({
    game_id: gameId,
    league: game.league,
    pool_canonical_ids: game.checkedInCanonicalIds,
    created_by: admin.canonicalId,
  });
  if (error) return { ok: false, error: "Could not start a draft for this game." };

  revalidateDraftPaths(gameId);
  return { ok: true };
}

export async function updateDraftPool(sessionId: number, canonicalIds: string[]): Promise<ActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("draft_sessions")
    .update({ pool_canonical_ids: canonicalIds })
    .eq("id", sessionId)
    .eq("status", "setup")
    .select("game_id")
    .maybeSingle();

  if (error) return { ok: false, error: "Could not update the draft pool." };
  if (!data) return { ok: false, error: "Draft has already started — the pool can no longer be edited." };

  revalidateDraftPaths(data.game_id);
  return { ok: true };
}

export async function setDraftCaptains(
  sessionId: number,
  homeCaptainId: string,
  awayCaptainId: string,
): Promise<ActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;
  if (homeCaptainId === awayCaptainId) return { ok: false, error: "Captains must be two different players." };

  const client = createServiceRoleClient();
  const { data: session } = await client
    .from("draft_sessions")
    .select("game_id, status, pool_canonical_ids")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "Draft session not found." };
  if (session.status !== "setup") return { ok: false, error: "Draft has already started." };
  if (!session.pool_canonical_ids.includes(homeCaptainId) || !session.pool_canonical_ids.includes(awayCaptainId)) {
    return { ok: false, error: "Both captains must be in the draft pool." };
  }

  const { error } = await client
    .from("draft_sessions")
    .update({ home_captain_canonical_id: homeCaptainId, away_captain_canonical_id: awayCaptainId })
    .eq("id", sessionId);
  if (error) return { ok: false, error: "Could not set captains." };

  revalidateDraftPaths(session.game_id);
  return { ok: true };
}

export async function setFirstPickSide(sessionId: number, side: DraftSide): Promise<ActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const client = createServiceRoleClient();
  const { data: session } = await client
    .from("draft_sessions")
    .select("game_id, status, home_captain_canonical_id, away_captain_canonical_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "Draft session not found." };
  if (session.status !== "setup") return { ok: false, error: "Draft has already started." };
  if (!session.home_captain_canonical_id || !session.away_captain_canonical_id) {
    return { ok: false, error: "Set both captains before recording the coin flip." };
  }

  const { error } = await client.from("draft_sessions").update({ first_pick_side: side }).eq("id", sessionId);
  if (error) return { ok: false, error: "Could not record the coin flip." };

  revalidateDraftPaths(session.game_id);
  return { ok: true };
}

/** `rawOverride: null` resets to the computed default turn-size sequence. */
export async function setTurnSizes(sessionId: number, rawOverride: string | null): Promise<ActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const session = await fetchSessionById(sessionId);
  if (!session) return { ok: false, error: "Draft session not found." };
  if (session.status !== "setup") return { ok: false, error: "Draft has already started." };

  const remainingCount = remainingCountFor(session);
  let turnSizes: number[];
  if (rawOverride === null || rawOverride.trim() === "") {
    turnSizes = buildDefaultTurnSizes(remainingCount);
  } else {
    const parsed = parseManualTurnSizes(rawOverride, remainingCount);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    turnSizes = parsed.turnSizes;
  }

  const client = createServiceRoleClient();
  const { error } = await client.from("draft_sessions").update({ turn_sizes: turnSizes }).eq("id", sessionId);
  if (error) return { ok: false, error: "Could not save the pick sequence." };

  revalidateDraftPaths(session.game_id);
  return { ok: true };
}

export async function beginDraft(sessionId: number): Promise<ActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const session = await fetchSessionById(sessionId);
  if (!session) return { ok: false, error: "Draft session not found." };
  if (session.status !== "setup") return { ok: false, error: "Draft has already started." };
  if (!session.home_captain_canonical_id || !session.away_captain_canonical_id) {
    return { ok: false, error: "Set both captains first." };
  }
  if (!session.first_pick_side) return { ok: false, error: "Record the coin flip first." };
  if (!session.turn_sizes || session.turn_sizes.length === 0) {
    return { ok: false, error: "Set the pick sequence first." };
  }

  const client = createServiceRoleClient();
  const { error } = await client.from("draft_sessions").update({ status: "in_progress" }).eq("id", sessionId);
  if (error) return { ok: false, error: "Could not begin the draft." };

  revalidateDraftPaths(session.game_id);
  return { ok: true };
}

async function fetchSessionById(sessionId: number): Promise<DraftSessionRow | null> {
  const client = createServiceRoleClient();
  const { data } = await client
    .from("draft_sessions")
    .select(
      "id, game_id, league, status, home_captain_canonical_id, away_captain_canonical_id, first_pick_side, pool_canonical_ids, turn_sizes",
    )
    .eq("id", sessionId)
    .maybeSingle();
  return (data as DraftSessionRow | null) ?? null;
}

export async function recordPick(sessionId: number, canonicalId: string): Promise<ActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const client = createServiceRoleClient();
  const session = await fetchSessionById(sessionId);
  if (!session) return { ok: false, error: "Draft session not found." };
  if (session.status !== "in_progress") return { ok: false, error: "Draft isn't in progress." };
  if (!session.first_pick_side || !session.turn_sizes) {
    return { ok: false, error: "Draft isn't fully set up." };
  }

  const { data: existingPicks } = await client
    .from("draft_picks")
    .select("pick_number, side, canonical_id")
    .eq("draft_session_id", sessionId)
    .order("pick_number", { ascending: true });
  const picks = (existingPicks ?? []) as DraftPickRow[];

  const captains = [session.home_captain_canonical_id, session.away_captain_canonical_id];
  const alreadyPicked = new Set(picks.map((p) => p.canonical_id));
  if (captains.includes(canonicalId)) return { ok: false, error: "Captains aren't drafted — they're already set." };
  if (alreadyPicked.has(canonicalId)) return { ok: false, error: "That player is already on a team." };
  if (!session.pool_canonical_ids.includes(canonicalId)) {
    return { ok: false, error: "That player isn't in the draft pool." };
  }

  const expandedSides = expandTurnsToSides(session.turn_sizes, session.first_pick_side);
  const pickIndex = picks.length;
  if (pickIndex >= expandedSides.length) return { ok: false, error: "The draft is already complete." };
  const side = expandedSides[pickIndex]!;
  const pickNumber = pickIndex + 1;

  const { error: insertError } = await client
    .from("draft_picks")
    .insert({ draft_session_id: sessionId, pick_number: pickNumber, side, canonical_id: canonicalId });
  if (insertError) return { ok: false, error: "Could not record that pick." };

  revalidateDraftPaths(session.game_id);

  if (pickNumber === expandedSides.length) {
    return finalizeDraft(client, session, [...picks, { pick_number: pickNumber, side, canonical_id: canonicalId }]);
  }

  return { ok: true };
}

/**
 * Undoes the single most recent pick — a fast-recovery safety net for a
 * misclick, distinct from restartDraft's full reset. Works whether the draft
 * is still in progress, or was just finalized by that very pick (in which
 * case the finalization is undone first: the game_records row it created is
 * deleted — cascading to its roster_spots/goal_events/notable_mentions, see
 * saveResolvedGame's rollbackAndFail comment — and the session goes back to
 * "in_progress" before the pick itself is removed).
 */
export async function undoLastPick(sessionId: number): Promise<ActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const session = await fetchSessionById(sessionId);
  if (!session) return { ok: false, error: "Draft session not found." };
  if (session.status !== "in_progress" && session.status !== "completed") {
    return { ok: false, error: "No picks to undo yet." };
  }

  const client = createServiceRoleClient();
  const { data: pickRows } = await client
    .from("draft_picks")
    .select("pick_number, side, canonical_id")
    .eq("draft_session_id", sessionId)
    .order("pick_number", { ascending: false })
    .limit(1);
  const lastPick = (pickRows as DraftPickRow[] | null)?.[0];
  if (!lastPick) return { ok: false, error: "No picks to undo yet." };

  if (session.status === "completed") {
    const { data: game } = await client
      .from("scheduled_games")
      .select("date, league")
      .eq("game_id", session.game_id)
      .maybeSingle();
    if (!game) return { ok: false, error: "Could not find this game to undo that pick." };

    const { error: deleteGameError } = await client
      .from("game_records")
      .delete()
      .eq("game_id", draftGameId(game.date, game.league));
    if (deleteGameError) return { ok: false, error: "Could not undo the finalized draft result." };

    const { error: reopenError } = await client
      .from("draft_sessions")
      .update({ status: "in_progress", completed_at: null })
      .eq("id", sessionId);
    if (reopenError) return { ok: false, error: "Could not reopen the draft." };
  }

  const { error: deletePickError } = await client
    .from("draft_picks")
    .delete()
    .eq("draft_session_id", sessionId)
    .eq("pick_number", lastPick.pick_number);
  if (deletePickError) return { ok: false, error: "Could not undo that pick." };

  revalidateDraftPaths(session.game_id);
  return { ok: true };
}

/**
 * Builds a bare GameRecord from a completed draft session — real, ground-truth pick
 * numbers (not a report's estimated draft order) — and saves it through the exact same
 * write path a pasted report uses (saveResolvedGame), so a report for this same game
 * later just needs to fill in score/goals/MVP rather than re-parsing the roster (see
 * saveReportImport's reconciliation logic in src/lib/report-parser/actions.ts).
 */
async function finalizeDraft(
  client: ReturnType<typeof createServiceRoleClient>,
  session: DraftSessionRow,
  picks: DraftPickRow[],
): Promise<ActionResult> {
  const { data: game } = await client
    .from("scheduled_games")
    .select("date, league")
    .eq("game_id", session.game_id)
    .maybeSingle();
  if (!game) return { ok: false, error: "Could not find this game's date to finalize the draft." };

  const gameId = draftGameId(game.date, game.league);
  const homePicks = picks.filter((p) => p.side === "home").sort((a, b) => a.pick_number - b.pick_number);
  const awayPicks = picks.filter((p) => p.side === "away").sort((a, b) => a.pick_number - b.pick_number);

  const gameRecord: GameRecord = {
    gameId,
    date: game.date,
    league: game.league,
    homeRoster: [
      { canonicalId: session.home_captain_canonical_id!, pickNumber: null },
      ...homePicks.map((p) => ({ canonicalId: p.canonical_id, pickNumber: p.pick_number })),
    ],
    awayRoster: [
      { canonicalId: session.away_captain_canonical_id!, pickNumber: null },
      ...awayPicks.map((p) => ({ canonicalId: p.canonical_id, pickNumber: p.pick_number })),
    ],
    homeTeamLabel: "Orange",
    awayTeamLabel: "Blue",
    homeScore: 0,
    awayScore: 0,
    goals: [],
    mvpCanonicalId: null,
    notableMentions: [],
    source: `draft:${session.game_id}`,
  };

  const saveResult = await saveResolvedGame(client, {
    gameRecord,
    provisionedPlayers: [],
    flaggedNames: [],
    rawText: "",
  });
  if (!saveResult.ok) return saveResult;

  const { error } = await client
    .from("draft_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", session.id);
  if (error) return { ok: false, error: "Draft picks saved, but could not mark the session complete." };

  revalidateDraftPaths(session.game_id);
  return { ok: true };
}

/**
 * Undoes a completed draft so its captains can redo the picks (e.g. they think the
 * resulting teams are unfair) — clears the recorded picks, deletes the game_records row
 * finalizeDraft created (which cascade-deletes its roster_spots/goal_events/
 * notable_mentions too, see saveResolvedGame's rollbackAndFail comment), and puts the
 * session back in "setup" with its pool/captains/coin-flip/turn-sizes left exactly as
 * they were — so the admin can either hit Begin Draft again immediately for a fresh
 * shuffle, or change any of those first.
 */
export async function restartDraft(sessionId: number): Promise<ActionResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const session = await fetchSessionById(sessionId);
  if (!session) return { ok: false, error: "Draft session not found." };
  if (session.status !== "completed") return { ok: false, error: "Only a completed draft can be restarted." };

  const client = createServiceRoleClient();
  const { data: game } = await client
    .from("scheduled_games")
    .select("date, league")
    .eq("game_id", session.game_id)
    .maybeSingle();
  if (!game) return { ok: false, error: "Could not find this game to restart its draft." };

  const { error: deleteGameError } = await client
    .from("game_records")
    .delete()
    .eq("game_id", draftGameId(game.date, game.league));
  if (deleteGameError) return { ok: false, error: "Could not undo the finalized draft result." };

  const { error: deletePicksError } = await client
    .from("draft_picks")
    .delete()
    .eq("draft_session_id", sessionId);
  if (deletePicksError) return { ok: false, error: "Could not clear the previous picks." };

  const { error: updateError } = await client
    .from("draft_sessions")
    .update({ status: "setup", completed_at: null })
    .eq("id", sessionId);
  if (updateError) return { ok: false, error: "Could not restart the draft." };

  revalidateDraftPaths(session.game_id);
  return { ok: true };
}

export async function getLiveDraftState(gameId: string): Promise<DraftSessionState | null> {
  const session = await fetchLatestSession(gameId);
  if (!session) return null;

  const client = createServiceRoleClient();
  const { data: pickRows } = await client
    .from("draft_picks")
    .select("pick_number, side, canonical_id")
    .eq("draft_session_id", session.id)
    .order("pick_number", { ascending: true });
  const picks = (pickRows ?? []) as DraftPickRow[];

  const captains = [session.home_captain_canonical_id, session.away_captain_canonical_id].filter(
    (id): id is string => id !== null,
  );
  const pickedIds = new Set(picks.map((p) => p.canonical_id));
  const remainingIds = session.pool_canonical_ids.filter(
    (id) => !captains.includes(id) && !pickedIds.has(id),
  );

  const [allPlayers, allGames] = await Promise.all([listPlayers(), listGameRecords()]);
  const playersById = new Map(allPlayers.map((p) => [p.canonicalId, p]));

  // Three independent rollups (not one rollup reused three ways) since each
  // scopes to a different game subset — Saturday-only, Sunday-only, and
  // every league combined — captains drafting for one league still want to
  // see how a player has gone in the other.
  const adrMapFor = (games: typeof allGames) =>
    new Map(rollupGameRecords(games, allPlayers).map((s) => [s.canonicalId, s.avgDraftPosition]));
  const saturdayAdr = adrMapFor(allGames.filter((g) => g.league === "saturday"));
  const sundayAdr = adrMapFor(allGames.filter((g) => g.league === "sunday"));
  const bothAdr = adrMapFor(allGames);

  // Every remaining player's own past draft-pick history, sent down once so
  // the client can recompute a time-windowed ADR (adr-window.ts) instantly on
  // every dropdown change instead of a round trip per selection — the shot
  // clock is running during a live draft, an extra fetch per click isn't
  // acceptable here.
  const remainingIdSet = new Set(remainingIds);
  const pickHistory: PickHistoryEntry[] = [];
  for (const game of allGames) {
    for (const roster of [game.homeRoster, game.awayRoster]) {
      roster.forEach((spot, idx) => {
        if (idx > 0 && spot.pickNumber !== null && remainingIdSet.has(spot.canonicalId)) {
          pickHistory.push({
            canonicalId: spot.canonicalId,
            date: game.date,
            league: game.league,
            pickNumber: spot.pickNumber,
          });
        }
      });
    }
  }

  // Ranked by the combined ("both") value, not the specific league being
  // drafted — a player who's only slightly worse in this league but much
  // better overall is still the better recommendation (e.g. someone with a
  // marginally lower Sunday-only ADR than another player who's much earlier
  // picked on Saturday should NOT outrank them; "both" is what actually
  // reflects who's the stronger overall pick).
  const sortKeyFor = (canonicalId: string) => bothAdr.get(canonicalId) ?? null;

  let currentSide: DraftSide | null = null;
  let expandedSides: DraftSide[] = [];
  if (session.status === "in_progress" && session.turn_sizes && session.first_pick_side) {
    expandedSides = expandTurnsToSides(session.turn_sizes, session.first_pick_side);
    currentSide = expandedSides[picks.length] ?? null;
  }

  // Positional need is scoped to whichever side is actually on the clock —
  // the team's current headcount per position group, versus a target quota
  // scaled to that side's own eventual final size (captain + however many
  // turns the turn-size sequence actually allots them, which the snake
  // 1-1-1-2 rule can make uneven between sides — see position-need.ts).
  let filledGroups = { goalkeeper: 0, defense: 0, midfield: 0, attack: 0 };
  let currentSideTeamSize = 0;
  if (currentSide) {
    const currentSideCaptainId = currentSide === "home" ? session.home_captain_canonical_id : session.away_captain_canonical_id;
    const currentSideRosterIds = [
      ...(currentSideCaptainId ? [currentSideCaptainId] : []),
      ...picks.filter((p) => p.side === currentSide).map((p) => p.canonical_id),
    ];
    filledGroups = countFilledGroups(currentSideRosterIds.map((id) => playersById.get(id)?.positions ?? []));
    currentSideTeamSize = currentSideRosterIds.length + expandedSides.slice(picks.length).filter((s) => s === currentSide).length;
  }

  const remainingRanked: RecommendedPlayer[] = remainingIds
    .map((canonicalId) => {
      const player = playersById.get(canonicalId);
      const positions = player?.positions ?? [];
      return {
        canonicalId,
        displayName: player ? rosterDisplayName(player) : canonicalId,
        avgDraftPosition: {
          saturday: saturdayAdr.get(canonicalId) ?? null,
          sunday: sundayAdr.get(canonicalId) ?? null,
          both: bothAdr.get(canonicalId) ?? null,
        },
        positions,
        positionallyNeeded: currentSide ? isPositionallyNeeded(positions, filledGroups, currentSideTeamSize) : true,
      };
    })
    .sort((a, b) => {
      // Positionally-needed players sort ahead of positionally-satisfied
      // ones as a group, THEN by ADR within each group — a surplus defender
      // never outranks a needed player just for having a better ADR, but
      // still sits in ADR order relative to other surplus players (so a
      // captain can still find the best available bench option among them).
      if (a.positionallyNeeded !== b.positionallyNeeded) return a.positionallyNeeded ? -1 : 1;
      const aKey = sortKeyFor(a.canonicalId);
      const bKey = sortKeyFor(b.canonicalId);
      if (aKey === null && bKey === null) return 0;
      if (aKey === null) return 1;
      if (bKey === null) return -1;
      return aKey - bKey;
    });

  return {
    id: session.id,
    gameId: session.game_id,
    league: session.league,
    status: session.status,
    homeCaptainId: session.home_captain_canonical_id,
    awayCaptainId: session.away_captain_canonical_id,
    firstPickSide: session.first_pick_side,
    poolCanonicalIds: session.pool_canonical_ids,
    turnSizes: session.turn_sizes,
    picks: picks.map((p) => ({ pickNumber: p.pick_number, side: p.side, canonicalId: p.canonical_id })),
    remainingRanked,
    currentSide,
    pickHistory,
  };
}
