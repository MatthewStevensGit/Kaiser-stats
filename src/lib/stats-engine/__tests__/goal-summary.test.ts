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

  it("keeps different scorers separate, in first-appearance order, with their own team", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "p2", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "p1", assistCanonicalId: "p2", team: "home" },
      { scorerCanonicalId: "p2", assistCanonicalId: null, team: "away" },
    ];
    expect(summarizeGoalsByScorer(goals)).toEqual([
      { scorerCanonicalId: "p2", team: "away", goals: 2 },
      { scorerCanonicalId: "p1", team: "home", goals: 1 },
    ]);
  });
});
