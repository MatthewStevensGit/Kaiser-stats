export type ScheduledLeague = "saturday" | "sunday";

/**
 * A future, scheduled game — distinct from GameRecord (stats-engine/types.ts),
 * which models a game already played. No real check-in/auth backend exists
 * yet, so checkedInCanonicalIds is demo-only data for now: only its length is
 * consumed by the UI, so these ids don't need to resolve against players.json.
 */
export interface ScheduledGame {
  gameId: string;
  date: string; // ISO 8601 date-only, e.g. "2026-07-18"
  league: ScheduledLeague;
  checkedInCanonicalIds: string[];
}
