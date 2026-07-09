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

export interface PlayerAggregate {
  canonicalId: string;
  displayName: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  goals: number;
  plusMinus: number;
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
