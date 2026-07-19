import { describe, expect, it } from "vitest";
import { buildDefaultTurnSizes, expandTurnsToSides, parseManualTurnSizes } from "../draft-order";

describe("buildDefaultTurnSizes", () => {
  it("returns an empty array for zero or negative counts", () => {
    expect(buildDefaultTurnSizes(0)).toEqual([]);
    expect(buildDefaultTurnSizes(-1)).toEqual([]);
  });

  it("is straight 1s with no double when there's no room for one (< 5 remaining)", () => {
    expect(buildDefaultTurnSizes(1)).toEqual([1]);
    expect(buildDefaultTurnSizes(4)).toEqual([1, 1, 1, 1]);
  });

  it("is 1,1,1,2 for exactly 5 remaining", () => {
    expect(buildDefaultTurnSizes(5)).toEqual([1, 1, 1, 2]);
  });

  it("continues with straight 1s after the double for a larger odd count", () => {
    // 4 turns (1,1,1,2 = 5 picks) + 6 more single-pick turns = 11 picks total.
    expect(buildDefaultTurnSizes(11)).toEqual([1, 1, 1, 2, 1, 1, 1, 1, 1, 1]);
  });

  it("continues with straight 1s after the double for a larger even count", () => {
    // 4 turns (1,1,1,2 = 5 picks) + 5 more single-pick turns = 10 picks total.
    expect(buildDefaultTurnSizes(10)).toEqual([1, 1, 1, 2, 1, 1, 1, 1, 1]);
  });
});

describe("expandTurnsToSides", () => {
  it("matches the user-confirmed worked example: 1,2,3 -> home,away,home; 4&5 -> away,away; 6 -> home", () => {
    const sides = expandTurnsToSides(buildDefaultTurnSizes(11), "home");
    expect(sides.slice(0, 6)).toEqual(["home", "away", "home", "away", "away", "home"]);
  });

  it("gives the side that picked second exactly one extra pick overall (odd remaining count)", () => {
    const sides = expandTurnsToSides(buildDefaultTurnSizes(11), "home");
    expect(sides).toHaveLength(11);
    expect(sides.filter((s) => s === "away")).toHaveLength(6); // picked second
    expect(sides.filter((s) => s === "home")).toHaveLength(5); // picked first
  });

  it("nets out an equal split for an even remaining count, despite the same fixed double rule applying", () => {
    // The turn-4 double always applies (confirmed regardless of parity), but for an
    // even remainingCount the turn COUNT works out odd, so the extra pick from the
    // double lands on a turn that alternates back to an equal 5-5 split overall —
    // not a separate rule, just what the same fixed sequence produces here.
    const sides = expandTurnsToSides(buildDefaultTurnSizes(10), "home");
    expect(sides).toHaveLength(10);
    expect(sides.filter((s) => s === "away")).toHaveLength(5);
    expect(sides.filter((s) => s === "home")).toHaveLength(5);
  });

  it("continues strict alternation indefinitely after the one double", () => {
    const sides = expandTurnsToSides(buildDefaultTurnSizes(11), "home");
    expect(sides).toEqual(["home", "away", "home", "away", "away", "home", "away", "home", "away", "home", "away"]);
  });

  it("respects a manually-supplied turn-size override, not just the default", () => {
    expect(expandTurnsToSides([1, 1], "away")).toEqual(["away", "home"]);
  });
});

describe("parseManualTurnSizes", () => {
  it("parses a space-separated sequence that sums correctly", () => {
    expect(parseManualTurnSizes("1 1 1 2 1", 6)).toEqual({ ok: true, turnSizes: [1, 1, 1, 2, 1] });
  });

  it("parses a dash-separated sequence", () => {
    expect(parseManualTurnSizes("1-1-1-2-1", 6)).toEqual({ ok: true, turnSizes: [1, 1, 1, 2, 1] });
  });

  it("rejects a sequence that doesn't sum to remainingCount", () => {
    const result = parseManualTurnSizes("1 1 1", 6);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-integer or non-positive entry", () => {
    expect(parseManualTurnSizes("1 1.5 1", 3).ok).toBe(false);
    expect(parseManualTurnSizes("1 0 1", 2).ok).toBe(false);
  });

  it("rejects empty input", () => {
    expect(parseManualTurnSizes("   ", 5).ok).toBe(false);
  });
});
