"use server";

import { getCurrentUser } from "../auth/session";
import { createServiceRoleClient } from "../supabase/client";
import type { GameRecord, League, NameResolution, PlayerIdentity } from "../stats-engine/types";
import { parseReportText, resolveExtractionToGameRecord } from "./parse-report";
import { saveResolvedGame, type SaveResult } from "./save";

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

  return saveResolvedGame(createServiceRoleClient(), {
    gameRecord: preview.gameRecord,
    provisionedPlayers: preview.provisionedPlayers,
    flaggedNames: preview.flaggedNames,
    rawText,
  });
}
