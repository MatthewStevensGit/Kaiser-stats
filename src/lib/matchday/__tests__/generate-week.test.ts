import { describe, expect, it } from "vitest";
import { computeNextWeekGameDates } from "../generate-week";

describe("computeNextWeekGameDates", () => {
  it("generates next Saturday/Sunday when run on a Sunday", () => {
    // 2026-07-19T18:00:00Z is 2026-07-19 2:00 PM EDT — a Sunday in ET.
    const result = computeNextWeekGameDates(new Date("2026-07-19T18:00:00.000Z"));
    expect(result).toEqual([
      { date: "2026-07-25", league: "saturday" },
      { date: "2026-07-26", league: "sunday" },
    ]);
  });

  it("anchors to the most recent Sunday when run on a non-Sunday (late/manual trigger)", () => {
    // 2026-07-21T18:00:00Z is 2026-07-21 2:00 PM EDT — a Tuesday in ET, same
    // week as the Sunday case above. Must produce the identical upcoming
    // week's games, not skip ahead to the week after.
    const result = computeNextWeekGameDates(new Date("2026-07-21T18:00:00.000Z"));
    expect(result).toEqual([
      { date: "2026-07-25", league: "saturday" },
      { date: "2026-07-26", league: "sunday" },
    ]);
  });

  it("resolves the correct ET calendar date when run during the fall-back DST weekend", () => {
    // 2026-11-01T23:30:00Z is well after the 2am-ET fall-back transition, so
    // already EST: 23:30 - 5h = 18:30 ET, still 2026-11-01 (a Sunday).
    const result = computeNextWeekGameDates(new Date("2026-11-01T23:30:00.000Z"));
    expect(result).toEqual([
      { date: "2026-11-07", league: "saturday" },
      { date: "2026-11-08", league: "sunday" },
    ]);
  });
});
