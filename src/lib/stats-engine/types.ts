export type League = "saturday" | "sunday" | "unknown";

export type StatsView = "saturday" | "sunday" | "merged";

export interface PlayerIdentity {
  canonicalId: string;
  displayName: string;
  aliases: string[];
  knownEmails: string[];
  leagues: League[];
  status: "regular" | "guest" | "deferred" | "example";
}

/**
 * One row of a season-standings sheet, normalized from a source spreadsheet.
 * Spreadsheet column sets vary year to year (see kaiser_stats_engine_notes.md) —
 * this shape is the intersection every year actually has.
 */
export interface SeasonStandingRow {
  source: string;
  league: League;
  playerNameRaw: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  goals: number | null;
  plusMinus: number | null;
  percent: number | null;
  points: number | null;
}

export interface NameResolution {
  raw: string;
  status: "exact" | "flagged" | "unresolved";
  canonicalId: string | null;
  candidates: { canonicalId: string; displayName: string; distance: number }[];
}

/**
 * The stable data contract: "one player's aggregated stats, in their final
 * clean form" — regardless of which messy source produced them. Both ingestion
 * paths converge here:
 *   - historical season-standings spreadsheets -> aggregateStandings() (aggregate.ts)
 *   - future per-game report parsing -> GameRecord[] -> rollupGameRecords() (game-records.ts)
 * See docs/data-contract.md for the full field-by-field explanation.
 *
 * `assists` and `mvpCount` only ever come from the GameRecord path — the
 * historical spreadsheets never tracked either (confirmed absent in all 5
 * years, see kaiser_stats_engine_notes.md), so spreadsheet-only aggregates
 * report both as 0 rather than omitting the fields.
 */
export interface PlayerSeasonStats {
  canonicalId: string;
  displayName: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  goals: number;
  assists: number;
  plusMinus: number;
  mvpCount: number;
  sources: string[];
}

export interface PlusMinusMismatch {
  source: string;
  playerNameRaw: string;
  wins: number;
  losses: number;
  statedPlusMinus: number;
  expectedPlusMinus: number;
}

/** One goal, as it will be extracted from a report by the future LLM parser. */
export interface GoalEvent {
  scorerCanonicalId: string;
  assistCanonicalId: string | null;
  team: "home" | "away";
}

/**
 * The stable data contract: "one game's worth of data," in its final clean
 * form. This is the shape the future LLM report-parser is expected to
 * produce — name resolution against the identity table has already happened
 * by the time a GameRecord exists, so every player reference here is a
 * canonicalId, never raw report text. See docs/data-contract.md.
 */
export interface GameRecord {
  gameId: string;
  date: string; // ISO 8601, e.g. "2026-07-05"
  league: League;
  homeRoster: string[]; // canonicalIds
  awayRoster: string[]; // canonicalIds
  homeScore: number;
  awayScore: number;
  goals: GoalEvent[];
  /** App-derived MVP call for this game, or null if not yet computed. */
  mvpCanonicalId: string | null;
  /** Provenance, e.g. "email:19f3315cf733a148" or "spreadsheet:soccer_2023.xlsx#Sheet1". */
  source: string;
}
