export type ScheduledLeague = "saturday" | "sunday";

/**
 * A future, scheduled game — distinct from GameRecord (stats-engine/types.ts),
 * which models a game already played. Backed by the real scheduled_games /
 * game_checkins tables as of the admin check-in slice (src/lib/matchday/data.ts)
 * — checkedInCanonicalIds is the list of currently-active (non-removed)
 * check-ins for this game.
 */
export interface ScheduledGame {
  gameId: string;
  date: string; // ISO 8601 date-only, e.g. "2026-07-18"
  league: ScheduledLeague;
  checkedInCanonicalIds: string[];
}

/** Result of a Matchday admin Server Action — never throws on an auth/validation failure. */
export type MatchdayActionResult = { ok: true } | { ok: false; error: string };
