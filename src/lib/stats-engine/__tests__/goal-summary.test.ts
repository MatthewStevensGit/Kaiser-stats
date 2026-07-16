import { describe, expect, it } from "vitest";
import { summarizePlayerGameStats } from "../goal-summary";
import type { GoalEvent } from "../types";

describe("summarizePlayerGameStats", () => {
  it("returns an empty list for no goals", () => {
    expect(summarizePlayerGameStats([])).toEqual([]);
  });

  it("consolidates a scorer's multiple goals into one entry with the right count", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
    ];
    expect(summarizePlayerGameStats(goals)).toEqual([
      { canonicalId: "p1", team: "home", goals: 2, assists: 0 },
    ]);
  });

  it("keeps different scorers separate, with their own team and goal count", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "p2", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "p2", assistCanonicalId: null, team: "away" },
    ];
    expect(summarizePlayerGameStats(goals)).toEqual([
      { canonicalId: "p1", team: "home", goals: 1, assists: 0 },
      { canonicalId: "p2", team: "away", goals: 2, assists: 0 },
    ]);
  });

  it("groups every home player before every away player, regardless of scoring order", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "away1", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "home1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "away2", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "home2", assistCanonicalId: null, team: "home" },
    ];
    expect(summarizePlayerGameStats(goals).map((s) => s.canonicalId)).toEqual([
      "home1",
      "home2",
      "away1",
      "away2",
    ]);
  });

  it("credits an assister on the same side as the scorer they set up", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "p1", assistCanonicalId: "p2", team: "home" },
    ];
    expect(summarizePlayerGameStats(goals)).toEqual([
      { canonicalId: "p1", team: "home", goals: 1, assists: 0 },
      { canonicalId: "p2", team: "home", goals: 0, assists: 1 },
    ]);
  });

  it("accumulates a player's assists across multiple goals, and combines their own goals + assists into one row", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "p1", assistCanonicalId: "p2", team: "home" },
      { scorerCanonicalId: "p3", assistCanonicalId: "p2", team: "home" },
      { scorerCanonicalId: "p2", assistCanonicalId: null, team: "home" },
    ];
    const stats = summarizePlayerGameStats(goals);
    expect(stats.find((s) => s.canonicalId === "p2")).toEqual({
      canonicalId: "p2",
      team: "home",
      goals: 1,
      assists: 2,
    });
  });
});
