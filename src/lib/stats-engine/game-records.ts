import type { GameRecord, PlayerIdentity, PlayerSeasonStats } from "./types";

export interface RecentFormStats {
  canonicalId: string;
  displayName: string;
  /** How many of their actual last-`windowSize` games these totals cover — usually `windowSize`, fewer for a newer player. */
  gamesPlayed: number;
  goals: number;
  assists: number;
  mvpCount: number;
  /** Same captain-excluded averaging as rollupGameRecords' avgDraftPosition, scoped to just this window's games. */
  avgDraftPosition: number | null;
}

/** A player's pickNumber in one game, or null if they weren't a drafted pick in it (captain, or no known draft order — see rollupGameRecords' avgDraftPosition doc comment). */
function findDraftPickNumber(game: GameRecord, canonicalId: string): number | null {
  for (const roster of [game.homeRoster, game.awayRoster]) {
    const index = roster.findIndex((spot) => spot.canonicalId === canonicalId);
    if (index > 0) return roster[index]!.pickNumber;
    if (index === 0) return null;
  }
  return null;
}

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
      roster.forEach((spot, index) => {
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

        // roster[0] is that team's captain (see prompt.ts rule 10) — their
        // pickNumber is always a structural stand-in (home captain always 1,
        // away captain always 2, by the default snake-order convention in
        // parse-report.ts), never a real draft decision, so a captain never
        // contributes to avgDraftPosition. Whoever captains varies game to
        // game (e.g. Sandrik captains one game, is a real drafted pick in
        // another) — this excludes only that specific game's appearance,
        // not the player generally.
        if (index > 0 && spot.pickNumber !== null) {
          draftPickSums.set(spot.canonicalId, (draftPickSums.get(spot.canonicalId) ?? 0) + spot.pickNumber);
          draftPickCounts.set(spot.canonicalId, (draftPickCounts.get(spot.canonicalId) ?? 0) + 1);
        }
      });
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

/**
 * Each player's goals/MVPs across their own actual last `windowSize` games
 * (not the last `windowSize` games of the league as a whole — a player who
 * skipped a few weeks still gets THEIR most recent games, not a stale mix).
 * Only ever includes players who appear in at least one of the given games.
 */
export function computeRecentForm(
  games: GameRecord[],
  knownPlayers: PlayerIdentity[],
  windowSize = 5,
): RecentFormStats[] {
  const playersById = new Map(knownPlayers.map((p) => [p.canonicalId, p]));
  const gamesByDateDesc = [...games].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const recentGamesByPlayer = new Map<string, GameRecord[]>();
  for (const game of gamesByDateDesc) {
    const participantIds = new Set([
      ...game.homeRoster.map((spot) => spot.canonicalId),
      ...game.awayRoster.map((spot) => spot.canonicalId),
    ]);
    for (const canonicalId of participantIds) {
      const recentGames = recentGamesByPlayer.get(canonicalId) ?? [];
      if (recentGames.length < windowSize) {
        recentGames.push(game);
        recentGamesByPlayer.set(canonicalId, recentGames);
      }
    }
  }

  return Array.from(recentGamesByPlayer.entries()).map(([canonicalId, recentGames]) => {
    let goals = 0;
    let assists = 0;
    let mvpCount = 0;
    let draftPickSum = 0;
    let draftPickCount = 0;
    for (const game of recentGames) {
      goals += game.goals.filter((goal) => goal.scorerCanonicalId === canonicalId).length;
      assists += game.goals.filter((goal) => goal.assistCanonicalId === canonicalId).length;
      if (game.mvpCanonicalId === canonicalId) mvpCount += 1;
      const pickNumber = findDraftPickNumber(game, canonicalId);
      if (pickNumber !== null) {
        draftPickSum += pickNumber;
        draftPickCount += 1;
      }
    }
    return {
      canonicalId,
      displayName: playersById.get(canonicalId)?.displayName ?? canonicalId,
      gamesPlayed: recentGames.length,
      goals,
      assists,
      mvpCount,
      avgDraftPosition: draftPickCount > 0 ? draftPickSum / draftPickCount : null,
    };
  });
}

/**
 * Picks which report-imported games (see rollupGameRecords above) should
 * additionally count toward the Table's totals, on top of the spreadsheet
 * backfill (aggregateStandings()) — see season_stats_cutoff's doc comment in
 * supabase/schema.sql. A game only counts when its year has a cutoff row AND
 * its date is strictly after that cutoff; a year with no cutoff row is
 * treated as a fully closed season (its spreadsheet is already complete),
 * so nothing for it ever auto-counts here, no matter how many game_records
 * exist for that year (e.g. from a later historical report backfill).
 * `year: "all"` matches every year that has a cutoff, same "all" convention
 * as filterSeasonStandingRowsByYear.
 */
export function selectStatsEligibleGames(
  games: GameRecord[],
  cutoffsByYear: Map<number, string>,
  year: string,
): GameRecord[] {
  return games.filter((game) => {
    const gameYear = Number(game.date.slice(0, 4));
    if (year !== "all" && String(gameYear) !== year) return false;
    const cutoff = cutoffsByYear.get(gameYear);
    return cutoff !== undefined && game.date > cutoff;
  });
}

/**
 * Year-filters game_records with NO cutoff check, unlike
 * selectStatsEligibleGames above — for stats that never existed in the
 * spreadsheet backfill at all (MVP count, see PlayerSeasonStats.mvpCount's
 * doc comment: always 0 from that path), there's no double-counting risk,
 * so every report-imported game counts the moment it's saved — whether it's
 * a brand-new game (a "frontfill") or an old historical report being
 * imported later (a "backfill") makes no difference for this one stat.
 * `year: "all"` matches every game regardless of year, same convention as
 * filterSeasonStandingRowsByYear / selectStatsEligibleGames.
 */
export function filterGameRecordsByYear(games: GameRecord[], year: string): GameRecord[] {
  if (year === "all") return games;
  return games.filter((game) => game.date.startsWith(year));
}

/**
 * Combines a spreadsheet-derived PlayerSeasonStats[] (aggregateStandings())
 * with a report-derived one (rollupGameRecords(), already narrowed to
 * stats-eligible games via selectStatsEligibleGames) into one per-player
 * total — the "going live with real data" query layer's last step, so a
 * player who appears in both sources gets one combined row instead of two.
 * avgDraftPosition only ever comes from the report side in practice (the
 * spreadsheet path always reports it null — see PlayerSeasonStats' doc
 * comment); this simple averages both sides' non-null values, which is only
 * an approximation (not weighted by game count) in the generic case.
 */
export function mergePlayerSeasonStats(
  spreadsheetStats: PlayerSeasonStats[],
  reportStats: PlayerSeasonStats[],
): PlayerSeasonStats[] {
  const merged = new Map<string, PlayerSeasonStats>();
  for (const stats of spreadsheetStats) {
    merged.set(stats.canonicalId, { ...stats, notableMentions: [...stats.notableMentions], sources: [...stats.sources] });
  }

  for (const stats of reportStats) {
    const existing = merged.get(stats.canonicalId);
    if (!existing) {
      merged.set(stats.canonicalId, { ...stats, notableMentions: [...stats.notableMentions], sources: [...stats.sources] });
      continue;
    }
    existing.games += stats.games;
    existing.wins += stats.wins;
    existing.losses += stats.losses;
    existing.ties += stats.ties;
    existing.goals += stats.goals;
    existing.assists += stats.assists;
    existing.mvpCount += stats.mvpCount;
    existing.plusMinus += stats.plusMinus;
    existing.notableMentions.push(...stats.notableMentions);
    existing.sources.push(...stats.sources);
    existing.avgDraftPosition =
      existing.avgDraftPosition === null
        ? stats.avgDraftPosition
        : stats.avgDraftPosition === null
          ? existing.avgDraftPosition
          : (existing.avgDraftPosition + stats.avgDraftPosition) / 2;
  }

  return Array.from(merged.values());
}
