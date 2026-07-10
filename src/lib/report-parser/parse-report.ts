import { createProvisionalIdentity, resolvePlayerName } from "../stats-engine/identity";
import type { GameRecord, GoalEvent, NameResolution, NotableMention, PlayerIdentity, RosterSpot } from "../stats-engine/types";
import { callGemini } from "./gemini-client";
import { buildExtractionPrompt } from "./prompt";
import type { RawExtraction } from "./types";

export async function parseReportText(apiKey: string, threadText: string): Promise<RawExtraction> {
  const prompt = buildExtractionPrompt(threadText);
  const responseText = await callGemini(apiKey, prompt);

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(`Gemini did not return valid JSON: ${responseText}`);
  }
  return parsed as RawExtraction;
}

export interface ResolvedReport {
  gameRecord: GameRecord;
  /** New identities auto-created for names with no fuzzy match to anything (see identity.ts). */
  provisionedPlayers: PlayerIdentity[];
  /** Names close to a DIFFERENT existing player — excluded from the GameRecord, need a human decision. */
  flaggedNames: NameResolution[];
  /** True if goal scorer counts per team don't sum to the stated score — per kaiser_BUILD_SPEC.md, don't trust this parse's goals without review if so. */
  goalSumMismatch: boolean;
}

/**
 * Converts a RawExtraction (LLM output, raw name strings) into a GameRecord
 * (canonicalIds only) — this is where identity resolution actually happens,
 * using the exact same deterministic, tested logic the spreadsheet-backfill
 * path uses (resolvePlayerName / createProvisionalIdentity), never the LLM's
 * own judgment about who a name "really" is.
 */
export function resolveExtractionToGameRecord(
  extraction: RawExtraction,
  knownPlayers: PlayerIdentity[],
  meta: { gameId: string; source: string; fallbackDate: string; fallbackLeague: "saturday" | "sunday" | "unknown" },
): ResolvedReport {
  const flaggedNames: NameResolution[] = [];
  const provisionedByRaw = new Map<string, PlayerIdentity>();
  const seenFlagged = new Set<string>();

  function resolve(raw: string): string | null {
    const pool = [...knownPlayers, ...provisionedByRaw.values()];
    const resolution = resolvePlayerName(raw, pool);

    if (resolution.status === "exact" && resolution.canonicalId) {
      return resolution.canonicalId;
    }
    if (resolution.status === "flagged") {
      const key = raw.toLowerCase();
      if (!seenFlagged.has(key)) {
        seenFlagged.add(key);
        flaggedNames.push(resolution);
      }
      return null;
    }
    // "unresolved" — no fuzzy match to anything, no misattribution risk.
    const key = raw.trim().toLowerCase();
    let provisional = provisionedByRaw.get(key);
    if (!provisional) {
      provisional = createProvisionalIdentity(raw);
      provisionedByRaw.set(key, provisional);
    }
    return provisional.canonicalId;
  }

  function resolveRoster(namesRaw: string[]): RosterSpot[] {
    const spots: RosterSpot[] = [];
    for (const raw of namesRaw) {
      const canonicalId = resolve(raw);
      if (canonicalId) spots.push({ canonicalId, pickNumber: null });
    }
    return spots;
  }

  const homeRoster = resolveRoster(extraction.homeRosterRaw ?? []);
  const awayRoster = resolveRoster(extraction.awayRosterRaw ?? []);

  const goals: GoalEvent[] = [];
  for (const g of extraction.goals ?? []) {
    const scorerCanonicalId = resolve(g.scorerRaw);
    if (!scorerCanonicalId) continue; // flagged/ambiguous scorer — don't attribute the goal at all
    const assistCanonicalId = g.assistRaw ? resolve(g.assistRaw) : null;
    goals.push({
      scorerCanonicalId,
      assistCanonicalId,
      team: g.team === "home" || g.team === "away" ? g.team : "home",
    });
  }

  const mvpCanonicalId = extraction.mvpRaw ? resolve(extraction.mvpRaw) : null;

  const notableMentions: NotableMention[] = [];
  for (const m of extraction.notableMentions ?? []) {
    const canonicalId = resolve(m.playerRaw);
    if (canonicalId) notableMentions.push({ canonicalId, quote: m.quote });
  }

  const homeScore = extraction.homeScore ?? 0;
  const awayScore = extraction.awayScore ?? 0;
  const homeGoalCount = goals.filter((g) => g.team === "home").length;
  const awayGoalCount = goals.filter((g) => g.team === "away").length;
  const goalSumMismatch =
    extraction.homeScore !== null &&
    extraction.awayScore !== null &&
    (homeGoalCount !== homeScore || awayGoalCount !== awayScore);

  const gameRecord: GameRecord = {
    gameId: meta.gameId,
    date: extraction.date ?? meta.fallbackDate,
    league: extraction.league === "saturday" || extraction.league === "sunday" ? extraction.league : meta.fallbackLeague,
    homeRoster,
    awayRoster,
    homeScore,
    awayScore,
    goals,
    mvpCanonicalId,
    notableMentions,
    source: meta.source,
  };

  return {
    gameRecord,
    provisionedPlayers: Array.from(provisionedByRaw.values()),
    flaggedNames,
    goalSumMismatch,
  };
}
