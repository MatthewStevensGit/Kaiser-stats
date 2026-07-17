import { describe, expect, it } from "vitest";
import { computeMvp, summarizePlayerGameStats } from "../goal-summary";
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

describe("computeMvp", () => {
  it("picks the clear stats leader over a narrative-only pick with zero goals/assists (Joe vs. Vadim's saves, real July 5 game)", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "johhny", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "edik", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "joe", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "joe", assistCanonicalId: null, team: "away" },
    ];
    // Narrative called out the home goalkeeper (Vadim) for good saves, but he has no goals/assists at all.
    expect(computeMvp(goals, 2, 2, "vadim")).toBe("joe");
  });

  it("never leaves MVP null just because there's no standout narrative — falls back to the sole stats leader (Emre, real July 3 game)", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "sandrik", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "isaac", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "matthew", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "kimran", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "emre", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "emre", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "oleg", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "jake", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "kolya", assistCanonicalId: "jake", team: "away" },
    ];
    expect(computeMvp(goals, 5, 4, null)).toBe("emre");
  });

  it("breaks a stats tie by preferring the player on the winning team", () => {
    const tiedGoals: GoalEvent[] = [
      { scorerCanonicalId: "home-star", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "away-star", assistCanonicalId: null, team: "away" },
    ];
    expect(computeMvp(tiedGoals, 1, 3, null)).toBe("away-star");
  });

  it("falls back to the narrative pick to break a tie when winning-team alone doesn't resolve it (real June 27 game: Elan vs. Matthew, both 4 goals for the winning team)", () => {
    const goals: GoalEvent[] = [
      { scorerCanonicalId: "elan", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "elan", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "elan", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "elan", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "matthew", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "matthew", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "matthew", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "matthew", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "gary", assistCanonicalId: null, team: "away" },
      { scorerCanonicalId: "gary", assistCanonicalId: null, team: "away" },
    ];
    expect(computeMvp(goals, 5, 10, "elan")).toBe("elan");
  });

  it("falls back to the narrative pick when there are no goals/assists extracted at all", () => {
    expect(computeMvp([], 0, 0, "vadim")).toBe("vadim");
  });

  it("returns null when there are no goals and no narrative pick either", () => {
    expect(computeMvp([], 0, 0, null)).toBeNull();
  });
});
