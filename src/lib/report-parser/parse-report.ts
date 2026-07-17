import { computeMvp } from "../stats-engine/goal-summary";
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

// A real response has been observed to come back HTTP 200, finishReason
// "STOP" (Gemini considers itself done), but with the JSON body truncated
// anyway — confirmed via usageMetadata showing thousands of tokens spent on
// invisible "thinking" before a short visible completion, nowhere near the
// maxOutputTokens cap. This is an intermittent model-side quirk, not a
// truncation we can fix by raising the cap further, so one retry (a fresh
// API call, not a re-parse of the same bad text) is the practical fix.
const MAX_PARSE_ATTEMPTS = 2;

export async function parseReportText(apiKey: string, threadText: string): Promise<RawExtraction> {
  const prompt = buildExtractionPrompt(threadText);

  let lastMalformedResponse = "";
  for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt++) {
    // Network/HTTP errors (quota exhaustion, high-demand 503s) propagate
    // immediately, never retried here — retrying those just burns more of a
    // daily quota that may already be exhausted, for no chance of success.
    const responseText = await callGemini(apiKey, prompt);
    try {
      return JSON.parse(responseText) as RawExtraction;
    } catch {
      lastMalformedResponse = responseText;
    }
  }
  throw new Error(
    `Gemini did not return valid JSON after ${MAX_PARSE_ATTEMPTS} attempts: ${lastMalformedResponse}`,
  );
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
   * human's attention, never silently ignored. Pick numbers stay null for
   * this game in that case (the default alternating assumption is skipped
   * too, since something about the annotation is already wrong).
   */
  firstPickWarning: string | null;
  /**
   * Set only if extraction.pickOrderRaw named someone who couldn't be
   * resolved to either roster — the rest of the narrated order is still
   * applied, but this game's pick numbers may be incomplete.
   */
  pickOrderWarning: string | null;
}

/**
 * Converts a RawExtraction (LLM output, raw name strings) into a GameRecord
 * (canonicalIds only) — this is where identity resolution actually happens,
 * using the exact same deterministic, tested logic the spreadsheet-backfill
 * path uses (resolvePlayerName / createProvisionalIdentity), never the LLM's
 * own judgment about who a name "really" is.
 *
 * Pick numbers, in priority order:
 * 1. Default (every game): the team listed first (home) is assumed to have
 *    picked first, alternating strict snake order (2*i+1 / 2*i+2) by each
 *    roster's own listed order — this is a confirmed league convention
 *    (first-listed player on each side is that team's captain, the rest of
 *    that side's list is already in the order they were drafted), not a
 *    guess. Overrides a `docs/data-contract.md` note from before this
 *    convention was confirmed with the league organizer.
 * 2. `firstPickRaw` (optional, human-supplied — see docs/report-parsing.md):
 *    the name of whoever actually picked first, when a specific game
 *    contradicts the default. Must match one roster's first-listed player,
 *    else `firstPickWarning` is set and pick numbers are left null rather
 *    than guessed.
 * 3. `extraction.pickOrderRaw` (optional, model-extracted — see prompt.ts
 *    rule 10): when a report narrates the real pick-by-pick order in prose,
 *    that ground truth overrides the default for every pick after the two
 *    captains (who keep pick 1/2 from the default/firstPickRaw step above).
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
  let homePicksFirst = true; // default: the team listed first (home) picked first — see resolveExtractionToGameRecord's doc comment
  if (firstPickRaw) {
    const firstPickCanonicalId = resolve(firstPickRaw);
    const homeFirst = homeRoster[0]?.canonicalId;
    const awayFirst = awayRoster[0]?.canonicalId;

    if (firstPickCanonicalId && firstPickCanonicalId === homeFirst) {
      homePicksFirst = true;
    } else if (firstPickCanonicalId && firstPickCanonicalId === awayFirst) {
      homePicksFirst = false;
    } else {
      firstPickWarning = `"First pick: ${firstPickRaw}" didn't match the first-listed player of either roster — pick numbers left null for this game rather than guessed.`;
    }
  }

  let pickOrderWarning: string | null = null;
  if (!firstPickWarning) {
    const firstRoster = homePicksFirst ? homeRoster : awayRoster;
    const secondRoster = homePicksFirst ? awayRoster : homeRoster;
    firstRoster.forEach((spot, i) => (spot.pickNumber = 2 * i + 1));
    secondRoster.forEach((spot, i) => (spot.pickNumber = 2 * i + 2));

    if (extraction.pickOrderRaw && extraction.pickOrderRaw.length > 0) {
      const allSpots = [...homeRoster, ...awayRoster];
      let nextPick = 3; // 1 and 2 already went to the two captains above
      for (const turn of extraction.pickOrderRaw) {
        const namesRaw = Array.isArray(turn) ? turn : [turn];
        for (const raw of namesRaw) {
          const canonicalId = resolve(raw);
          const spot = canonicalId ? allSpots.find((s) => s.canonicalId === canonicalId) : undefined;
          if (spot) {
            spot.pickNumber = nextPick;
          } else if (!pickOrderWarning) {
            pickOrderWarning = `"${raw}" from the narrated pick order wasn't found on either roster — some pick numbers may be incomplete for this game.`;
          }
          nextPick += 1;
        }
      }
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

  const narrativeMvpCanonicalId = extraction.mvpRaw ? resolve(extraction.mvpRaw) : null;

  const notableMentions: NotableMention[] = [];
  for (const m of extraction.notableMentions ?? []) {
    const canonicalId = resolve(m.playerRaw);
    if (canonicalId) notableMentions.push({ canonicalId, quote: m.quote });
  }

  const homeScore = extraction.homeScore ?? 0;
  const awayScore = extraction.awayScore ?? 0;
  const mvpCanonicalId = computeMvp(goals, homeScore, awayScore, narrativeMvpCanonicalId);
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
    // Only ever populated by the model when the report itself names sides
    // (see RawExtraction's doc comment) — otherwise this plain default
    // applies. Unlike a player identity, a wrong guess here can't
    // misattribute anyone's stats, it's just a label.
    homeTeamLabel: extraction.homeTeamLabelRaw?.trim() || "Orange",
    awayTeamLabel: extraction.awayTeamLabelRaw?.trim() || "Blue",
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
    pickOrderWarning,
  };
}
