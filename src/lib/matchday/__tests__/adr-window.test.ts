import { describe, expect, it } from "vitest";
import { applyAdrWindow, computeWindowedAdr, windowCutoffIso, type PickHistoryEntry } from "../adr-window";

describe("windowCutoffIso", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");

  it("returns null for 'all' (no cutoff)", () => {
    expect(windowCutoffIso("all", now)).toBeNull();
  });

  it("returns Jan 1 of the current year for 'ytd'", () => {
    expect(windowCutoffIso("ytd", now)).toBe("2026-01-01");
  });

  it("subtracts one month for '1m'", () => {
    expect(windowCutoffIso("1m", now)).toBe("2026-06-19");
  });

  it("subtracts three months for '3m'", () => {
    expect(windowCutoffIso("3m", now)).toBe("2026-04-19");
  });

  it("subtracts six months for '6m'", () => {
    expect(windowCutoffIso("6m", now)).toBe("2026-01-19");
  });

  it("subtracts one year for '1y'", () => {
    expect(windowCutoffIso("1y", now)).toBe("2025-07-19");
  });
});

describe("computeWindowedAdr", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");

  function entry(overrides: Partial<PickHistoryEntry> = {}): PickHistoryEntry {
    return { canonicalId: "p1", date: "2026-07-01", league: "sunday", pickNumber: 3, ...overrides };
  }

  it("computes a real average from even a single qualifying game -- never hidden for a small sample", () => {
    const history = [entry({ pickNumber: 7 })];
    const result = computeWindowedAdr(history, "p1", "all", now);
    expect(result.both).toBe(7);
    expect(result.bothGames).toBe(1);
  });

  it("is null only when there are literally zero qualifying games", () => {
    const history: PickHistoryEntry[] = [];
    const result = computeWindowedAdr(history, "p1", "all", now);
    expect(result.both).toBeNull();
    expect(result.bothGames).toBe(0);
  });

  it("averages 2 games and reports the count as 2 (a low-sample warning is a UI concern, not a hide condition)", () => {
    const history = [entry({ pickNumber: 1 }), entry({ pickNumber: 5 })];
    const result = computeWindowedAdr(history, "p1", "all", now);
    expect(result.both).toBe(3);
    expect(result.bothGames).toBe(2);
  });

  it("averages 3+ qualifying games normally", () => {
    const history = [entry({ pickNumber: 1 }), entry({ pickNumber: 2 }), entry({ pickNumber: 3 })];
    const result = computeWindowedAdr(history, "p1", "all", now);
    expect(result.both).toBe(2);
    expect(result.bothGames).toBe(3);
  });

  it("excludes games outside the selected window", () => {
    const history = [
      entry({ pickNumber: 1, date: "2026-07-10" }),
      entry({ pickNumber: 2, date: "2026-07-05" }),
      entry({ pickNumber: 3, date: "2026-07-01" }),
      // Outside a 1-month window from 2026-07-19 (cutoff 2026-06-19):
      entry({ pickNumber: 99, date: "2026-01-01" }),
    ];
    const result = computeWindowedAdr(history, "p1", "1m", now);
    expect(result.both).toBe(2); // (1+2+3)/3, the old one excluded
    expect(result.bothGames).toBe(3);
  });

  it("'last3' averages exactly the player's own 3 most recent games", () => {
    const history = [
      entry({ pickNumber: 1, date: "2026-07-15" }),
      entry({ pickNumber: 2, date: "2026-07-10" }),
      entry({ pickNumber: 3, date: "2026-07-05" }),
      entry({ pickNumber: 99, date: "2020-01-01" }),
    ];
    expect(computeWindowedAdr(history, "p1", "last3", now).both).toBe((1 + 2 + 3) / 3);
  });

  it("'last3' still averages with only 2 games ever (just reports a count of 2)", () => {
    const history = [entry({ pickNumber: 1 }), entry({ pickNumber: 2 })];
    const result = computeWindowedAdr(history, "p1", "last3", now);
    expect(result.both).toBe(1.5);
    expect(result.bothGames).toBe(2);
  });

  it("'last5' averages only the player's own 5 most recent games, ignoring older ones", () => {
    const history = [
      entry({ pickNumber: 1, date: "2026-07-15" }),
      entry({ pickNumber: 2, date: "2026-07-10" }),
      entry({ pickNumber: 3, date: "2026-07-05" }),
      entry({ pickNumber: 4, date: "2026-07-01" }),
      entry({ pickNumber: 5, date: "2026-06-25" }),
      // 6th-most-recent -- should be excluded from a "last 5" average:
      entry({ pickNumber: 99, date: "2020-01-01" }),
    ];
    expect(computeWindowedAdr(history, "p1", "last5", now).both).toBe((1 + 2 + 3 + 4 + 5) / 5);
  });

  it("'last10' behaves the same way, just with a bigger cap", () => {
    const history = Array.from({ length: 12 }, (_, i) =>
      entry({ pickNumber: i + 1, date: `2026-07-${String(19 - i).padStart(2, "0")}` }),
    );
    // Most recent 10 pick numbers are 1..10 (dates count down from today).
    expect(computeWindowedAdr(history, "p1", "last10", now).both).toBe((1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10) / 10);
  });

  it("'last5' scopes Saturday/Sunday independently -- each column is that player's own last 5 games IN that league, not last 5 overall", () => {
    const history = [
      // 5 recent Saturday games:
      entry({ league: "saturday", pickNumber: 1, date: "2026-07-18" }),
      entry({ league: "saturday", pickNumber: 2, date: "2026-07-11" }),
      entry({ league: "saturday", pickNumber: 3, date: "2026-07-04" }),
      entry({ league: "saturday", pickNumber: 4, date: "2026-06-27" }),
      entry({ league: "saturday", pickNumber: 5, date: "2026-06-20" }),
      // Only 2 Sunday games -- still averaged, just with a low game count.
      entry({ league: "sunday", pickNumber: 10, date: "2026-07-19" }),
      entry({ league: "sunday", pickNumber: 20, date: "2026-07-12" }),
    ];
    const result = computeWindowedAdr(history, "p1", "last5", now);
    expect(result.saturday).toBe((1 + 2 + 3 + 4 + 5) / 5);
    expect(result.sunday).toBe(15);
    expect(result.sundayGames).toBe(2);
  });

  it("computes saturday/sunday/both independently", () => {
    const history = [
      entry({ league: "saturday", pickNumber: 1 }),
      entry({ league: "saturday", pickNumber: 2 }),
      entry({ league: "saturday", pickNumber: 3 }),
      entry({ league: "sunday", pickNumber: 10 }),
      entry({ league: "sunday", pickNumber: 20 }),
    ];
    const result = computeWindowedAdr(history, "p1", "all", now);
    expect(result.saturday).toBe(2);
    expect(result.sunday).toBe(15);
    expect(result.sundayGames).toBe(2);
    expect(result.both).toBe((1 + 2 + 3 + 10 + 20) / 5);
  });

  it("ignores entries for other players", () => {
    const history = [entry({ canonicalId: "other", pickNumber: 1 }), entry({ pickNumber: 2 }), entry({ pickNumber: 3 }), entry({ pickNumber: 4 })];
    expect(computeWindowedAdr(history, "p1", "all", now).both).toBe(3); // (2+3+4)/3, "other" excluded
  });
});

describe("applyAdrWindow", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");

  function entry(canonicalId: string, pickNumber: number, date = "2026-07-01"): PickHistoryEntry {
    return { canonicalId, date, league: "sunday", pickNumber };
  }

  it("keeps positionally-needed players ahead of surplus ones regardless of ADR", () => {
    const history = [
      entry("surplus-but-great", 1),
      entry("surplus-but-great", 1),
      entry("surplus-but-great", 1),
      entry("needed-but-mediocre", 8),
      entry("needed-but-mediocre", 8),
      entry("needed-but-mediocre", 8),
    ];
    const remaining = [
      { canonicalId: "surplus-but-great", positionallyNeeded: false },
      { canonicalId: "needed-but-mediocre", positionallyNeeded: true },
    ];
    const result = applyAdrWindow(remaining, history, "all", now);
    expect(result.map((p) => p.canonicalId)).toEqual(["needed-but-mediocre", "surplus-but-great"]);
  });

  it("sorts ascending by windowed ADR within the same needed/surplus group", () => {
    const history = [
      entry("a", 5),
      entry("a", 5),
      entry("a", 5),
      entry("b", 1),
      entry("b", 1),
      entry("b", 1),
    ];
    const remaining = [
      { canonicalId: "a", positionallyNeeded: true },
      { canonicalId: "b", positionallyNeeded: true },
    ];
    const result = applyAdrWindow(remaining, history, "all", now);
    expect(result.map((p) => p.canonicalId)).toEqual(["b", "a"]);
  });

  it("pushes players with no qualifying data (null ADR) to the bottom of their group", () => {
    const history = [entry("has-data", 3), entry("has-data", 3), entry("has-data", 3)];
    const remaining = [
      { canonicalId: "no-data", positionallyNeeded: true },
      { canonicalId: "has-data", positionallyNeeded: true },
    ];
    const result = applyAdrWindow(remaining, history, "all", now);
    expect(result.map((p) => p.canonicalId)).toEqual(["has-data", "no-data"]);
  });
});
