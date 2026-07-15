import type { GameRecord, PlayerIdentity, PlayerSeasonStats } from "./types";

/** A game's outcome from one specific side's perspective. */
export function resultForSide(
  homeScore: number,
  awayScore: number,
  side: "home" | "away",
): "win" | "draw" | "loss" {
  if (homeScore === awayScore) return "draw";
  const winningSide = homeScore > awayScore ? "home" : "away";
  return side === winningSide ? "win" : "loss";
}

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
  // avgDraftPosition needs a running sum/count that isn't part of the public
  // PlayerSeasonStats shape, so it's tracked here and folded in at the end.
  const draftPickSums = new Map<string, number>();
  const draftPickCounts = new Map<string, number>();

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
      avgDraftPosition: null,
      notableMentions: [],
      plusMinus: 0,
      sources: [],
    };
    totals.set(canonicalId, created);
    return created;
  }

  for (const game of games) {
    for (const [side, roster] of [
      ["home", game.homeRoster],
      ["away", game.awayRoster],
    ] as const) {
      for (const spot of roster) {
        const stats = statsFor(spot.canonicalId);
        stats.games += 1;
        stats.sources.push(game.source);
        const result = resultForSide(game.homeScore, game.awayScore, side);
        if (result === "draw") {
          stats.ties += 1;
        } else if (result === "win") {
          stats.wins += 1;
          stats.plusMinus += 1;
        } else {
          stats.losses += 1;
          stats.plusMinus -= 1;
        }

        if (spot.pickNumber !== null) {
          draftPickSums.set(spot.canonicalId, (draftPickSums.get(spot.canonicalId) ?? 0) + spot.pickNumber);
          draftPickCounts.set(spot.canonicalId, (draftPickCounts.get(spot.canonicalId) ?? 0) + 1);
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

    for (const mention of game.notableMentions) {
      statsFor(mention.canonicalId).notableMentions.push(mention.quote);
    }
  }

  for (const stats of totals.values()) {
    const count = draftPickCounts.get(stats.canonicalId);
    const sum = draftPickSums.get(stats.canonicalId);
    stats.avgDraftPosition = count && sum !== undefined ? sum / count : null;
  }

  return Array.from(totals.values());
}
