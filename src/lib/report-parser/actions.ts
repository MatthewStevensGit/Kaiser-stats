"use server";

import { getCurrentUser } from "../auth/session";
import { createServiceRoleClient } from "../supabase/client";
import type { GameRecord, NameResolution, PlayerIdentity } from "../stats-engine/types";
import { parseReportText, resolveExtractionToGameRecord } from "./parse-report";
import { findExistingDraftGameId, mergeReportIntoDraftGame, saveResolvedGame, type SaveResult } from "./save";

export interface ReportPreview {
  gameRecord: GameRecord;
  /** Every canonicalId referenced above (known + newly provisioned), resolved for rendering. */
  displayNames: Record<string, string>;
  /** Same keys as displayNames — null for anyone with no roster name set (e.g. every provisioned player, always). */
  rosterNames: Record<string, string | null>;
  provisionedPlayers: PlayerIdentity[];
  flaggedNames: NameResolution[];
  goalSumMismatch: boolean;
  firstPickWarning: string | null;
  pickOrderWarning: string | null;
}

type PreviewResult = { ok: true; preview: ReportPreview } | { ok: false; error: string };

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
    .select("canonical_id, display_name, roster_name, aliases, known_emails, leagues, status");

  return (data ?? []).map((row) => ({
    canonicalId: row.canonical_id,
    displayName: row.display_name,
    rosterName: row.roster_name,
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

function buildRosterNames(known: PlayerIdentity[], provisioned: PlayerIdentity[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const p of [...known, ...provisioned]) map[p.canonicalId] = p.rosterName ?? null;
  return map;
}

export async function previewReportImport(input: {
  text: string;
  firstPickRaw: string | null;
}): Promise<PreviewResult> {
  const admin = await requireAdminResult();
  if ("ok" in admin) return admin;

  const text = input.text.trim();
  if (!text) return { ok: false, error: "Paste the report text first." };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY is not configured on the server." };

  const knownPlayers = await fetchKnownPlayers();

  let extraction;
  try {
    extraction = await parseReportText(apiKey, text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Report parsing failed." };
  }

  // Date/league used to be typed in separately by the admin, but the pasted
  // thread always already states them (the original email's date line/subject,
  // e.g. "Saturday, June 27" or "Vadim ..., 2026-06-27:") — so Gemini's own
  // extraction (see prompt.ts's date/league fields) is now the only source.
  // No silent fallback to "today"/"unknown": a wrong guess here would produce
  // a wrong gameId and a mislabeled game record, so this is a hard error
  // instead, telling the admin to make sure that line is in the pasted text.
  if (!extraction.date) {
    return {
      ok: false,
      error: "Couldn't find a date in that text — make sure the pasted thread includes the original date/subject line.",
    };
  }
  if (extraction.league !== "saturday" && extraction.league !== "sunday") {
    return {
      ok: false,
      error: "Couldn't tell whether this was the Saturday or Sunday league from that text — make sure the pasted thread includes the original subject line.",
    };
  }

  const gameId = `report-${extraction.date}-${extraction.league}`;
  const source = `manual:${extraction.date}-${extraction.league}`;

  const resolved = resolveExtractionToGameRecord(
    extraction,
    knownPlayers,
    { gameId, source, fallbackDate: extraction.date, fallbackLeague: extraction.league },
    input.firstPickRaw,
  );

  return {
    ok: true,
    preview: {
      gameRecord: resolved.gameRecord,
      displayNames: buildDisplayNames(knownPlayers, resolved.provisionedPlayers),
      rosterNames: buildRosterNames(knownPlayers, resolved.provisionedPlayers),
      provisionedPlayers: resolved.provisionedPlayers,
      flaggedNames: resolved.flaggedNames,
      goalSumMismatch: resolved.goalSumMismatch,
      firstPickWarning: resolved.firstPickWarning,
      pickOrderWarning: resolved.pickOrderWarning,
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

  // A live draft may have already created a real game_records row for this exact
  // date/league (see draft-actions.ts's finalizeDraft) — its roster/pick numbers are
  // ground truth, not this parse's estimate, so this report only ever fills in the
  // score/goals/MVP on top of it rather than inserting a second, conflicting row.
  const existingDraftGameId = await findExistingDraftGameId(
    client,
    preview.gameRecord.date,
    preview.gameRecord.league,
  );
  if (existingDraftGameId) {
    return mergeReportIntoDraftGame(client, {
      draftGameId: existingDraftGameId,
      gameRecord: preview.gameRecord,
      provisionedPlayers: preview.provisionedPlayers,
      flaggedNames: preview.flaggedNames,
      rawText,
    });
  }

  return saveResolvedGame(client, {
    gameRecord: preview.gameRecord,
    provisionedPlayers: preview.provisionedPlayers,
    flaggedNames: preview.flaggedNames,
    rawText,
  });
}
