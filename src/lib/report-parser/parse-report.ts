import { createProvisionalIdentity, resolvePlayerName } from "../stats-engine/identity";
import type { GameRecord, GoalEvent, NameResolution, NotableMention, PlayerIdentity, RosterSpot } from "../stats-engine/types";
import { callGemini } from "./gemini-client";
import { buildExtractionPrompt } from "./prompt";
import type { RawExtraction } from "./types";

const FIRST_PICK_LINE = /^\s*first pick\s*:\s*(.+?)\s*$/im;

/**
 * Pulls an optional "First pick: <name>" annotation out of a report text
 * file before it's sent to Gemini — this is a human-supplied fact typed
 * into the local file, never something the model reads or infers, so it's
 * parsed here with a plain regex and stripped out of what the model sees.
 */
export function extractFirstPickAnnotation(rawFileText: string): { firstPickRaw: string | null; threadText: string } {
  const match = rawFileText.match(FIRST_PICK_LINE);
  if (!match) return { firstPickRaw: null, threadText: rawFileText };
  return {
    firstPickRaw: match[1]?.trim() ?? null,
    threadText: rawFileText.replace(FIRST_PICK_LINE, "").trim(),
  };
}

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
  /**
   * Set only if a "First pick" annotation was supplied but didn't match the
   * first-listed player of either roster — a real inconsistency worth a
   * human's attention, never silently ignored. Pick numbers stay null in
   * this case, same as when no annotation is given at all.
   */
  firstPickWarning: string | null;
}

/**
 * Converts a RawExtraction (LLM output, raw name strings) into a GameRecord
 * (canonicalIds only) — this is where identity resolution actually happens,
 * using the exact same deterministic, tested logic the spreadsheet-backfill
 * path uses (resolvePlayerName / createProvisionalIdentity), never the LLM's
 * own judgment about who a name "really" is.
 *
 * `firstPickRaw` is an optional, human-supplied fact (never LLM-guessed —
 * see docs/report-parsing.md): the name of whoever was picked first in this
 * specific game's draft. When given and it matches the first-listed player
 * of one roster, pick numbers are computed by interleaving both rosters in
 * their listed order (which, per league convention, is pick order) — real
 * data for that one confirmed game, not a pattern applied to every game.
 * Every other game simply keeps pickNumber: null, exactly as before.
 */
export function resolveExtractionToGameRecord(
  extraction: RawExtraction,
  knownPlayers: PlayerIdentity[],
  meta: { gameId: string; source: string; fallbackDate: string; fallbackLeague: "saturday" | "sunday" | "unknown" },
  firstPickRaw?: string | null,
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

  let firstPickWarning: string | null = null;
  if (firstPickRaw) {
    const firstPickCanonicalId = resolve(firstPickRaw);
    const homeFirst = homeRoster[0]?.canonicalId;
    const awayFirst = awayRoster[0]?.canonicalId;

    if (firstPickCanonicalId && firstPickCanonicalId === homeFirst) {
      homeRoster.forEach((spot, i) => (spot.pickNumber = 2 * i + 1));
      awayRoster.forEach((spot, i) => (spot.pickNumber = 2 * i + 2));
    } else if (firstPickCanonicalId && firstPickCanonicalId === awayFirst) {
      awayRoster.forEach((spot, i) => (spot.pickNumber = 2 * i + 1));
      homeRoster.forEach((spot, i) => (spot.pickNumber = 2 * i + 2));
    } else {
      firstPickWarning = `"First pick: ${firstPickRaw}" didn't match the first-listed player of either roster — pick numbers left null for this game rather than guessed.`;
    }
  }

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
    firstPickWarning,
  };
}
