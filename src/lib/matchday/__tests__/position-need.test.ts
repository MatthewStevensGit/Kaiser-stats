import { describe, expect, it } from "vitest";
import { countFilledGroups, isPositionallyNeeded, targetQuota } from "../position-need";

describe("targetQuota", () => {
  it("scales the standard 4-3-3-ish share to an 11-person team", () => {
    expect(targetQuota("goalkeeper", 11)).toBe(1);
    expect(targetQuota("defense", 11)).toBe(4);
    expect(targetQuota("midfield", 11)).toBe(3);
    expect(targetQuota("attack", 11)).toBe(3);
  });

  it("scales down proportionally for a smaller team", () => {
    expect(targetQuota("defense", 6)).toBe(2); // 4/11 * 6 = 2.18 -> 2
  });

  it("never rounds a group's quota down to zero, even for a tiny team", () => {
    expect(targetQuota("goalkeeper", 3)).toBe(1); // 1/11 * 3 = 0.27 -> rounds to 0, floored up to 1
  });
});

describe("countFilledGroups", () => {
  it("counts a single-position player once toward their one group", () => {
    const counts = countFilledGroups([["CB"], ["ST"]]);
    expect(counts).toEqual({ goalkeeper: 0, defense: 1, midfield: 0, attack: 1 });
  });

  it("counts a versatile player toward every distinct group they list, not just one", () => {
    const counts = countFilledGroups([["CB", "CM"]]);
    expect(counts).toEqual({ goalkeeper: 0, defense: 1, midfield: 1, attack: 0 });
  });

  it("counts a player who lists two positions in the SAME group only once for that group", () => {
    const counts = countFilledGroups([["LB", "RB"]]);
    expect(counts.defense).toBe(1);
  });

  it("ignores a player with no listed positions", () => {
    const counts = countFilledGroups([[]]);
    expect(counts).toEqual({ goalkeeper: 0, defense: 0, midfield: 0, attack: 0 });
  });
});

describe("isPositionallyNeeded", () => {
  const fullCounts = { goalkeeper: 1, defense: 4, midfield: 3, attack: 3 };
  const emptyCounts = { goalkeeper: 0, defense: 0, midfield: 0, attack: 0 };

  it("is true for a player with no listed positions (unknown versatility isn't penalized)", () => {
    expect(isPositionallyNeeded([], fullCounts, 11)).toBe(true);
  });

  it("is false once every position a player plays is already at quota", () => {
    expect(isPositionallyNeeded(["CB"], fullCounts, 11)).toBe(false);
  });

  it("is true when a player's position group is still under quota", () => {
    expect(isPositionallyNeeded(["CB"], emptyCounts, 11)).toBe(true);
  });

  it("is true for a multi-position player as long as ANY of their groups still has room", () => {
    // Defense is full, but midfield isn't -- a CB/CM should still count as needed.
    const mixedCounts = { goalkeeper: 1, defense: 4, midfield: 0, attack: 3 };
    expect(isPositionallyNeeded(["CB", "CM"], mixedCounts, 11)).toBe(true);
  });

  it("is false for a multi-position player only when EVERY one of their groups is full", () => {
    expect(isPositionallyNeeded(["CB", "LB"], fullCounts, 11)).toBe(false);
  });
});
