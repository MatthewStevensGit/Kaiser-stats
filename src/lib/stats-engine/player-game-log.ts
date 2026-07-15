import { resultForSide } from "./game-records";
import type { GameRecord, League } from "./types";

export interface PlayerGameLogEntry {
  gameId: string;
  date: string; // ISO 8601, same as GameRecord.date
  league: League;
  side: "home" | "away";
  homeScore: number;
  awayScore: number;
  result: "win" | "draw" | "loss";
  /** This player's own goals in this specific game. */
  goals: number;
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
      isMvp: game.mvpCanonicalId === canonicalId,
    });
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
