import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameRecord, NameResolution, PlayerIdentity } from "../stats-engine/types";
import { buildPersistenceRows } from "./persist";

const UNIQUE_VIOLATION = "23505";

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Writes a resolved report into Supabase — shared by the admin web UI
 * (src/lib/report-parser/actions.ts's saveReportImport, which wraps this
 * with an admin check) and the bulk historical-backfill CLI script
 * (scripts/backfill-reports.ts), so both paths write identically rather
 * than maintaining two copies of this logic.
 */
export async function saveResolvedGame(
  client: SupabaseClient,
  params: {
    gameRecord: GameRecord;
    provisionedPlayers: PlayerIdentity[];
    flaggedNames: NameResolution[];
    rawText: string;
  },
): Promise<SaveResult> {
  const gameRecord: GameRecord = { ...params.gameRecord, description: params.rawText };
  const { gameRecordRow, rosterSpotRows, goalEventRows, notableMentionRows } = buildPersistenceRows(gameRecord);

  const { error: gameRecordError } = await client.from("game_records").insert(gameRecordRow);
  if (gameRecordError) {
    if (gameRecordError.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "A match report already exists for that date/league." };
    }
    return { ok: false, error: "Could not save that match report." };
  }

  async function rollbackAndFail(message: string): Promise<{ ok: false; error: string }> {
    // roster_spots/goal_events/notable_mentions all cascade-delete from
    // game_records, so this cleans up any partial writes below in one call —
    // leaves the game_id free to retry rather than stuck as a broken row.
    await client.from("game_records").delete().eq("game_id", gameRecord.gameId);
    return { ok: false, error: message };
  }

  if (params.provisionedPlayers.length > 0) {
    const { error } = await client.from("players").upsert(
      params.provisionedPlayers.map((p) => ({
        canonical_id: p.canonicalId,
        display_name: p.displayName,
        aliases: p.aliases,
        known_emails: p.knownEmails,
        leagues: p.leagues,
        status: p.status,
      })),
    );
    if (error) return rollbackAndFail("Could not save the new players from this report.");
  }

  if (rosterSpotRows.length > 0) {
    const { error } = await client.from("roster_spots").insert(rosterSpotRows);
    if (error) return rollbackAndFail("Could not save the rosters from this report.");
  }

  if (goalEventRows.length > 0) {
    const { error } = await client.from("goal_events").insert(goalEventRows);
    if (error) return rollbackAndFail("Could not save the goals from this report.");
  }

  if (notableMentionRows.length > 0) {
    const { error } = await client.from("notable_mentions").insert(notableMentionRows);
    if (error) return rollbackAndFail("Could not save the notable mentions from this report.");
  }

  // Best-effort only: a flagged name is a durable "needs a human" log entry,
  // not core game data — losing one to a transient error shouldn't roll back
  // an otherwise-successful save.
  for (const flag of params.flaggedNames) {
    const { data: existing } = await client
      .from("unresolved_names_log")
      .select("id")
      .eq("raw_name", flag.raw)
      .eq("source", gameRecord.source)
      .is("resolved_at", null)
      .limit(1);

    if (!existing || existing.length === 0) {
      const best = flag.candidates[0];
      const { error } = await client.from("unresolved_names_log").insert({
        raw_name: flag.raw,
        status: flag.status,
        candidate_canonical_id: best?.canonicalId ?? null,
        candidate_distance: best?.distance ?? null,
        source: gameRecord.source,
      });
      if (error) console.error("Failed to log flagged name", flag.raw, error);
    }
  }

  return { ok: true };
}

/** The game_records id a completed live draft creates for this date/league — see draft-actions.ts's finalizeDraft. */
export function draftGameId(date: string, league: string): string {
  return `draft-${date}-${league}`;
}

/**
 * If a live draft already created a game_records row for this date/league (real,
 * ground-truth roster/pick numbers — see draft-actions.ts), a later report import for
 * the same game must UPDATE that row (score/goals/MVP/notable mentions) rather than
 * insert a second, conflicting `report-...` row — the draft's roster_spots are left
 * completely untouched, since they're more trustworthy than the report parse's own
 * roster guess. Returns null if no such draft row exists, meaning the caller should
 * fall through to the normal saveResolvedGame() insert path instead.
 */
export async function findExistingDraftGameId(
  client: SupabaseClient,
  date: string,
  league: string,
): Promise<string | null> {
  const gameId = draftGameId(date, league);
  const { data } = await client.from("game_records").select("game_id").eq("game_id", gameId).maybeSingle();
  return data ? gameId : null;
}

/**
 * Merges a parsed report's score/goals/MVP/notable-mentions into an existing
 * draft-sourced game_records row — see findExistingDraftGameId's doc comment for why
 * this exists instead of a plain insert. `gameRecord` is expected to already carry the
 * DRAFT's gameId (via findExistingDraftGameId), not its own `report-...` id.
 */
export async function mergeReportIntoDraftGame(
  client: SupabaseClient,
  params: {
    draftGameId: string;
    gameRecord: GameRecord;
    provisionedPlayers: PlayerIdentity[];
    flaggedNames: NameResolution[];
    rawText: string;
  },
): Promise<SaveResult> {
  const { draftGameId: gameId, gameRecord, provisionedPlayers, flaggedNames, rawText } = params;

  const { error: updateError } = await client
    .from("game_records")
    .update({
      home_score: gameRecord.homeScore,
      away_score: gameRecord.awayScore,
      mvp_canonical_id: gameRecord.mvpCanonicalId,
      home_team_label: gameRecord.homeTeamLabel,
      away_team_label: gameRecord.awayTeamLabel,
      description: rawText,
    })
    .eq("game_id", gameId);
  if (updateError) return { ok: false, error: "Could not update the draft game with this report." };

  if (provisionedPlayers.length > 0) {
    const { error } = await client.from("players").upsert(
      provisionedPlayers.map((p) => ({
        canonical_id: p.canonicalId,
        display_name: p.displayName,
        aliases: p.aliases,
        known_emails: p.knownEmails,
        leagues: p.leagues,
        status: p.status,
      })),
    );
    if (error) return { ok: false, error: "Could not save the new players from this report." };
  }

  if (gameRecord.goals.length > 0) {
    const { error } = await client.from("goal_events").insert(
      gameRecord.goals.map((goal) => ({
        game_id: gameId,
        scorer_canonical_id: goal.scorerCanonicalId,
        assist_canonical_id: goal.assistCanonicalId,
        team: goal.team,
      })),
    );
    if (error) return { ok: false, error: "Could not save the goals from this report." };
  }

  if (gameRecord.notableMentions.length > 0) {
    const { error } = await client.from("notable_mentions").insert(
      gameRecord.notableMentions.map((mention) => ({
        game_id: gameId,
        canonical_id: mention.canonicalId,
        quote: mention.quote,
      })),
    );
    if (error) return { ok: false, error: "Could not save the notable mentions from this report." };
  }

  for (const flag of flaggedNames) {
    const { data: existing } = await client
      .from("unresolved_names_log")
      .select("id")
      .eq("raw_name", flag.raw)
      .eq("source", gameRecord.source)
      .is("resolved_at", null)
      .limit(1);

    if (!existing || existing.length === 0) {
      const best = flag.candidates[0];
      const { error } = await client.from("unresolved_names_log").insert({
        raw_name: flag.raw,
        status: flag.status,
        candidate_canonical_id: best?.canonicalId ?? null,
        candidate_distance: best?.distance ?? null,
        source: gameRecord.source,
      });
      if (error) console.error("Failed to log flagged name", flag.raw, error);
    }
  }

  return { ok: true };
}
