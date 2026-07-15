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
  /** Resolved display value — the game's own override, or KICKOFF_LABEL_BY_LEAGUE[league]. */
  kickoffLabel: string;
  /** Resolved display value — the game's own override, or VENUE_BY_LEAGUE[league]. */
  venue: string;
  cancelled: boolean;
}

/** Result of a Matchday admin Server Action — never throws on an auth/validation failure. */
export type MatchdayActionResult = { ok: true } | { ok: false; error: string };
