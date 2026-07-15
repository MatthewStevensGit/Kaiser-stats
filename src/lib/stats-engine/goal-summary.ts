import type { GoalEvent } from "./types";

export interface ScorerSummary {
  scorerCanonicalId: string;
  team: "home" | "away";
  goals: number;
}

/**
 * Groups a game's goal events by scorer (one row per player, not one per
 * goal) — a scorer's own goal count and team, in first-appearance order.
 * Assists aren't tracked here: this is purely "who scored how many, for
 * which side," matching the Past Matches goal list's display needs.
 */
export function summarizeGoalsByScorer(goals: GoalEvent[]): ScorerSummary[] {
  const order: string[] = [];
  const byScorer = new Map<string, ScorerSummary>();

  for (const goal of goals) {
    let entry = byScorer.get(goal.scorerCanonicalId);
    if (!entry) {
      entry = { scorerCanonicalId: goal.scorerCanonicalId, team: goal.team, goals: 0 };
      byScorer.set(goal.scorerCanonicalId, entry);
      order.push(goal.scorerCanonicalId);
    }
    entry.goals += 1;
  }

  return order.map((id) => byScorer.get(id)!);
}
