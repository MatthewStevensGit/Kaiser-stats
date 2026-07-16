/**
 * What Gemini extracts, in raw-name form — before identity resolution.
 * Deliberately mirrors GameRecord's shape but with *Raw name strings
 * instead of canonicalIds, since name resolution is our deterministic,
 * tested code's job (identity.ts), never the LLM's — see
 * resolveExtractionToGameRecord() in parse-report.ts.
 */
export interface RawGoalEvent {
  scorerRaw: string;
  assistRaw: string | null;
  team: "home" | "away" | "unknown";
}

export interface RawNotableMention {
  playerRaw: string;
  quote: string;
}

export interface RawExtraction {
  date: string | null;
  league: "saturday" | "sunday" | "unknown";
  homeRosterRaw: string[];
  awayRosterRaw: string[];
  /**
   * "Home"/"away" has no real meaning for a pickup game — these are only
   * ever populated when the report itself names each side (e.g. "Team
   * Orange"/"Team Blue"), same first-group/second-group convention as the
   * rosters. Null when the report doesn't name sides at all — never guessed
   * by the model; a default display label is applied later in code (see
   * resolveExtractionToGameRecord), not here.
   */
  homeTeamLabelRaw: string | null;
  awayTeamLabelRaw: string | null;
  homeScore: number | null;
  awayScore: number | null;
  goals: RawGoalEvent[];
  /** Vadim's own report narrative only — never a reply's stated opinion. Null if not stated. */
  mvpRaw: string | null;
  notableMentions: RawNotableMention[];
}
