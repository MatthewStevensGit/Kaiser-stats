import { resultForSide } from "./game-records";
import type { GameRecord, League } from "./types";

export interface PlayerGameLogEntry {
  gameId: string;
  date: string; // ISO 8601, same as GameRecord.date
  league: League;
  side: "home" | "away";
  /** Null for a "no report" game — see GameRecord.homeScore's doc comment. */
  homeScore: number | null;
  awayScore: number | null;
  /** Null when homeScore/awayScore are null — no outcome to show. */
  result: "win" | "draw" | "loss" | null;
  /** This player's own goals in this specific game. */
  goals: number;
  /** This player's own assists in this specific game. */
  assists: number;
  /** Whether this player was the app's determined MVP for this specific game. */
  isMvp: boolean;
}

/**
 * A single player's personalized view of the games they were involved in —
 * which side they were on, the result from their perspective, and how many
 * of the game's goals were theirs. Built entirely from GameRecord's existing
 * roster/goals fields; unlike rollupGameRecords(), this preserves per-game
 * granularity instead of collapsing it into season totals.
 */
export function getPlayerGameLog(canonicalId: string, games: GameRecord[]): PlayerGameLogEntry[] {
  const entries: PlayerGameLogEntry[] = [];

  for (const game of games) {
    const side: "home" | "away" | null = game.homeRoster.some((r) => r.canonicalId === canonicalId)
      ? "home"
      : game.awayRoster.some((r) => r.canonicalId === canonicalId)
        ? "away"
        : null;
    if (!side) continue;

    entries.push({
      gameId: game.gameId,
      date: game.date,
      league: game.league,
      side,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      result: resultForSide(game.homeScore, game.awayScore, side),
      goals: game.goals.filter((g) => g.scorerCanonicalId === canonicalId).length,
      assists: game.goals.filter((g) => g.assistCanonicalId === canonicalId).length,
      isMvp: game.mvpCanonicalId === canonicalId,
    });
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export interface SpreadsheetYearReconciliation {
  /** The player's goal total for the year straight from the season spreadsheet — the source of truth. */
  officialGoals: number;
  /** Of `officialGoals`, how many are individually attributable to a specific reported game in `log`. */
  trackedGoals: number;
  /**
   * `officialGoals - trackedGoals`, floored at 0. Goals the spreadsheet counted
   * that no report ever broke down to a scorer — they happened in a game with no
   * report at all, or in a report that gave the score without naming every scorer.
   * Not recoverable; the spreadsheet stays authoritative.
   */
  unaccountedGoals: number;
  /** Games in `log` that have a final score (a real report exists). */
  reportedGames: number;
  /** Games in `log` with no score — roster known, no report ever sent. */
  noReportGames: number;
}

/**
 * For a season the app only has the spreadsheet for (no per-game `season_stats_cutoff`),
 * explains why a player's game-by-game log doesn't sum to their season goal total:
 * some of their games were never reported per-scorer. Pure — the page passes in the
 * spreadsheet total and that player's year-filtered log.
 */
export function reconcileSpreadsheetYear(
  officialGoals: number,
  log: PlayerGameLogEntry[],
): SpreadsheetYearReconciliation {
  let trackedGoals = 0;
  let reportedGames = 0;
  let noReportGames = 0;
  for (const entry of log) {
    if (entry.homeScore === null || entry.awayScore === null) {
      noReportGames += 1;
      continue;
    }
    reportedGames += 1;
    trackedGoals += entry.goals;
  }
  return {
    officialGoals,
    trackedGoals,
    unaccountedGoals: Math.max(0, officialGoals - trackedGoals),
    reportedGames,
    noReportGames,
  };
}
