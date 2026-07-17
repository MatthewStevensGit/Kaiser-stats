import type { GoalEvent } from "./types";

export interface PlayerGameStat {
  canonicalId: string;
  team: "home" | "away";
  goals: number;
  assists: number;
}

/**
 * Groups a game's goal events by player (one row per player, not one per
 * goal/assist) — each player's own goal count, assist count, and team.
 * Grouped by team (every home-side player, then every away-side player)
 * rather than interleaved by when each goal happened — much easier to scan
 * than an order that jumps between sides goal-by-goal. First-appearance
 * order (as scorer or assister, whichever came first) is preserved within
 * each team group.
 *
 * Assist coverage is always going to be sparse (most reports never narrate
 * one) — same "show it when known, say nothing when not" treatment as MVP
 * and notable mentions elsewhere in this app: never a ranking input (see
 * PlayerSeasonStats.assists), just extra context when it happens to exist.
 */
export function summarizePlayerGameStats(goals: GoalEvent[]): PlayerGameStat[] {
  const order: string[] = [];
  const byPlayer = new Map<string, PlayerGameStat>();

  function entryFor(canonicalId: string, team: "home" | "away"): PlayerGameStat {
    let entry = byPlayer.get(canonicalId);
    if (!entry) {
      entry = { canonicalId, team, goals: 0, assists: 0 };
      byPlayer.set(canonicalId, entry);
      order.push(canonicalId);
    }
    return entry;
  }

  for (const goal of goals) {
    entryFor(goal.scorerCanonicalId, goal.team).goals += 1;
    // An assister is always on the same side as the scorer they set up.
    if (goal.assistCanonicalId) entryFor(goal.assistCanonicalId, goal.team).assists += 1;
  }

  const summaries = order.map((id) => byPlayer.get(id)!);
  return [...summaries.filter((s) => s.team === "home"), ...summaries.filter((s) => s.team === "away")];
}

/**
 * MVP is decided here, deterministically from real stats — not left to the
 * model's own narrative judgment (updated 2026-07-16, after real games
 * showed the opposite: a goalkeeper with vague "made good saves" narrative
 * beat a player who scored both of his team's goals in a draw, and a game
 * with no standout narrative was left with no MVP at all instead of
 * crediting the only player with 2 goals). Goals + assists combined is the
 * primary signal; ties are broken by preferring the winning team, then by
 * whichever of the tied players the report's own narrative called out
 * (narrativeMvpCanonicalId), then arbitrarily-but-deterministically.
 * `narrativeMvpCanonicalId` is only ever consulted as a tiebreaker, and as
 * the sole fallback when literally no goals/assists were extracted for this
 * game at all (nothing to compute a stats leader from).
 */
export function computeMvp(
  goals: GoalEvent[],
  homeScore: number,
  awayScore: number,
  narrativeMvpCanonicalId: string | null,
): string | null {
  const stats = summarizePlayerGameStats(goals);
  if (stats.length === 0) return narrativeMvpCanonicalId;

  const maxCount = Math.max(...stats.map((s) => s.goals + s.assists));
  const leaders = stats.filter((s) => s.goals + s.assists === maxCount);
  if (leaders.length === 1) return leaders[0]!.canonicalId;

  const winningTeam = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : null;
  const winningTeamLeaders = winningTeam ? leaders.filter((s) => s.team === winningTeam) : [];
  const finalists = winningTeamLeaders.length > 0 ? winningTeamLeaders : leaders;
  if (finalists.length === 1) return finalists[0]!.canonicalId;

  const narrativeMatch = finalists.find((s) => s.canonicalId === narrativeMvpCanonicalId);
  return (narrativeMatch ?? finalists[0])!.canonicalId;
}
