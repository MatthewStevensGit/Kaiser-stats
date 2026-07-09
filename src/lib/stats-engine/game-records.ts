import type { GameRecord, PlayerIdentity, PlayerSeasonStats } from "./types";

/**
 * Rolls up per-game records into the same PlayerSeasonStats shape that
 * aggregateStandings() produces from historical spreadsheets (see
 * aggregate.ts and docs/data-contract.md). This is what proves the two
 * ingestion paths — spreadsheet backfill and future LLM report parsing —
 * actually converge on one contract instead of drifting into two
 * incompatible systems.
 *
 * Unlike aggregateStandings(), this never has an "unresolved name" case:
 * by the time a GameRecord exists, name resolution against the identity
 * table has already happened (see types.ts), so every roster entry here is
 * already a canonicalId.
 */
export function rollupGameRecords(
  games: GameRecord[],
  knownPlayers: PlayerIdentity[],
): PlayerSeasonStats[] {
  const totals = new Map<string, PlayerSeasonStats>();
  const playersById = new Map(knownPlayers.map((p) => [p.canonicalId, p]));

  function statsFor(canonicalId: string): PlayerSeasonStats {
    const existing = totals.get(canonicalId);
    if (existing) return existing;
    const player = playersById.get(canonicalId);
    const created: PlayerSeasonStats = {
      canonicalId,
      displayName: player?.displayName ?? canonicalId,
      games: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      goals: 0,
      assists: 0,
      mvpCount: 0,
      plusMinus: 0,
      sources: [],
    };
    totals.set(canonicalId, created);
    return created;
  }

  for (const game of games) {
    const result: "home" | "away" | "tie" =
      game.homeScore === game.awayScore ? "tie" : game.homeScore > game.awayScore ? "home" : "away";

    for (const [side, roster] of [
      ["home", game.homeRoster],
      ["away", game.awayRoster],
    ] as const) {
      for (const canonicalId of roster) {
        const stats = statsFor(canonicalId);
        stats.games += 1;
        stats.sources.push(game.source);
        if (result === "tie") {
          stats.ties += 1;
        } else if (result === side) {
          stats.wins += 1;
          stats.plusMinus += 1;
        } else {
          stats.losses += 1;
          stats.plusMinus -= 1;
        }
      }
    }

    for (const goal of game.goals) {
      statsFor(goal.scorerCanonicalId).goals += 1;
      if (goal.assistCanonicalId) {
        statsFor(goal.assistCanonicalId).assists += 1;
      }
    }

    if (game.mvpCanonicalId) {
      statsFor(game.mvpCanonicalId).mvpCount += 1;
    }
  }

  return Array.from(totals.values());
}
