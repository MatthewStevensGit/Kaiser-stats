import type { PlayerSeasonStats } from "./types";

/**
 * Power ranking formula, chosen and disclosed transparently (see
 * kaiser_BUILD_SPEC.md — Vadim's own system changed its formula more than
 * once and 2025 tracks two disagreeing formulas in parallel, so there is no
 * single "correct" historical answer to match). This ranks by plus-minus
 * per game, gated by a minimum-games floor.
 *
 * Deliberately excludes:
 * - Assists (coverage bias — see kaiser_stats_engine_notes.md).
 * - Snake-draft pick order (encodes the captains' priors, not performance —
 *   using it as a ranking input would be circular).
 *
 * Draft position still shows up on every entry as `draftDisparity` — but
 * strictly as a post-sort annotation, computed from the rank this formula
 * already produced. It never feeds back into the sort itself (see
 * kaiser_BUILD_SPEC.md's "performance relative to draft position, like
 * fantasy sports' value-over-ADP, not a direct input").
 */
const RANKING_FORMULA_DESCRIPTION =
  "plus-minus per game (wins minus losses, divided by games played), minimum-games floor applied, assists and draft position excluded";

export interface PowerRankingEntry extends PlayerSeasonStats {
  plusMinusPerGame: number;
  rank: number;
  /**
   * rank − avgDraftPosition, or null if the player has no draft data.
   * Positive: performs worse than their draft slot implied (drafted early,
   * ranked low) — an "underperformer" relative to captains' expectations.
   * Negative: performs better than their draft slot implied (drafted late,
   * ranked high) — a "sleeper."
   */
  draftDisparity: number | null;
}

export function computePowerRankings(
  players: PlayerSeasonStats[],
  minGames: number,
): { formula: string; minGames: number; entries: PowerRankingEntry[] } {
  const entries = players
    .filter((p) => p.games >= minGames)
    .map((p) => ({ ...p, plusMinusPerGame: p.plusMinus / p.games, rank: 0, draftDisparity: null as number | null }))
    .sort((a, b) => b.plusMinusPerGame - a.plusMinusPerGame)
    .map((entry, i) => {
      const rank = i + 1;
      return {
        ...entry,
        rank,
        draftDisparity: entry.avgDraftPosition !== null ? rank - entry.avgDraftPosition : null,
      };
    });

  return { formula: RANKING_FORMULA_DESCRIPTION, minGames, entries };
}
