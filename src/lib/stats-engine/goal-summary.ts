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
