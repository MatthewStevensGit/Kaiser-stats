import { describe, expect, it } from "vitest";
import { summarizeGoalsByScorer } from "../goal-summary";
import type { GoalEvent } from "../types";

describe("summarizeGoalsByScorer", () => {
  it("returns an empty list for no goals", () => {
    expect(summarizeGoalsByScorer([])).toEqual([]);
  });

  it("consolidates a scorer's multiple goals into one entry with the right count", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
    ];
    expect(summarizeGoalsByScorer(goals)).toEqual([
      { scorerCanonicalId: "p1", team: "home", goals: 2 },
    ]);
  });

  it("keeps different scorers separate, with their own team and goal count", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "p2", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "p1", assistCanonicalId: "p2", team: "home" },
      { scorerCanonicalId: "p2", assistCanonicalId: null, team: "away" },
    ];
    expect(summarizeGoalsByScorer(goals)).toEqual([
      { scorerCanonicalId: "p1", team: "home", goals: 1 },
      { scorerCanonicalId: "p2", team: "away", goals: 2 },
    ]);
  });

  it("groups every home scorer before every away scorer, regardless of scoring order", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "away1", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "home1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "away2", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "home2", assistCanonicalId: null, team: "home" },
    ];
    expect(summarizeGoalsByScorer(goals).map((s) => s.scorerCanonicalId)).toEqual([
      "home1",
      "home2",
      "away1",
      "away2",
    ]);
  });
});
