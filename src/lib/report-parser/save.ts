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
