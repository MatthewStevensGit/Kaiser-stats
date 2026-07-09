import type { PlayerAggregate } from "./types";

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
 */
const RANKING_FORMULA_DESCRIPTION =
  "plus-minus per game (wins minus losses, divided by games played), minimum-games floor applied, assists and draft position excluded";

export interface PowerRankingEntry extends PlayerAggregate {
  plusMinusPerGame: number;
  rank: number;
}

export function computePowerRankings(
  players: PlayerAggregate[],
  minGames: number,
): { formula: string; minGames: number; entries: PowerRankingEntry[] } {
  const entries = players
    .filter((p) => p.games >= minGames)
    .map((p) => ({ ...p, plusMinusPerGame: p.plusMinus / p.games, rank: 0 }))
    .sort((a, b) => b.plusMinusPerGame - a.plusMinusPerGame)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  return { formula: RANKING_FORMULA_DESCRIPTION, minGames, entries };
}
