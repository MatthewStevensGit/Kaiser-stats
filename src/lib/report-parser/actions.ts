"use server";

import { getCurrentUser } from "../auth/session";
import { createServiceRoleClient } from "../supabase/client";
import type { GameRecord, League, NameResolution, PlayerIdentity } from "../stats-engine/types";
import { parseReportText, resolveExtractionToGameRecord } from "./parse-report";
import { buildPersistenceRows } from "./persist";

const UNIQUE_VIOLATION = "23505";

export interface ReportPreview {
  gameRecord: GameRecord;
  /** Every canonicalId referenced above (known + newly provisioned), resolved for rendering. */
  displayNames: Record<string, string>;
  provisionedPlayers: PlayerIdentity[];
  flaggedNames: NameResolution[];
  goalSumMismatch: boolean;
  firstPickWarning: string | null;
}

type PreviewResult = { ok: true; preview: ReportPreview } | { ok: false; error: string };
type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Every action here independently re-checks admin-ness — Server Actions are
 * reachable regardless of which page's JSX references them, same reasoning
 * as requireAdminResult() in src/lib/matchday/actions.ts (not shared across
 * modules, matching that file's existing convention).
 */
async function requireAdminResult(): Promise<{ canonicalId: string } | { ok: false; error: string }> {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return { ok: false, error: "Admin access required." };
  return admin;
}

async function fetchKnownPlayers(): Promise<PlayerIdentity[]> {
  const client = createServiceRoleClient();
  const { data } = await client
    .from("players")
    .select("canonical_id, display_name, aliases, known_emails, leagues, status");

  return (data ?? []).map((row) => ({
    canonicalId: row.canonical_id,
    displayName: row.display_name,
    aliases: row.aliases ?? [],
    knownEmails: row.known_emails ?? [],
    leagues: row.leagues ?? [],
    status: row.status,
  }));
}

function buildDisplayNames(known: PlayerIdentity[], provisioned: PlayerIdentity[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of [...known, ...provisioned]) map[p.canonicalId] = p.displayName;
  return map;
}

export async function previewReportImport(input: {
  text: string;
  date: string;
  league: League;
  firstPickRaw: string | null;
}): Promise<PreviewResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const text = input.text.trim();
  if (!text) return { ok: false, error: "Paste the report text first." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Enter a valid date." };
  if (input.league !== "saturday" && input.league !== "sunday") {
    return { ok: false, error: "Choose a league." };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY is not configured on the server." };

  const knownPlayers = await fetchKnownPlayers();

  let extraction;
  try {
    extraction = await parseReportText(apiKey, text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Report parsing failed." };
  }

  const gameId = `report-${input.date}-${input.league}`;
  const source = `manual:${input.date}-${input.league}`;

  const resolved = resolveExtractionToGameRecord(
    extraction,
    knownPlayers,
    { gameId, source, fallbackDate: input.date, fallbackLeague: input.league },
    input.firstPickRaw,
  );

  return {
    ok: true,
    preview: {
      gameRecord: resolved.gameRecord,
      displayNames: buildDisplayNames(knownPlayers, resolved.provisionedPlayers),
      provisionedPlayers: resolved.provisionedPlayers,
      flaggedNames: resolved.flaggedNames,
      goalSumMismatch: resolved.goalSumMismatch,
      firstPickWarning: resolved.firstPickWarning,
    },
  };
}

export async function saveReportImport(
  preview: ReportPreview,
  rawText: string,
): Promise<SaveResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const client = createServiceRoleClient();
  const gameRecord: GameRecord = { ...preview.gameRecord, description: rawText };
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

  if (preview.provisionedPlayers.length > 0) {
    const { error } = await client.from("players").upsert(
      preview.provisionedPlayers.map((p) => ({
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
  for (const flag of preview.flaggedNames) {
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
