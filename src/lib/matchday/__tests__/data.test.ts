import { describe, expect, it } from "vitest";
import { buildScheduledGames } from "../data";

describe("buildScheduledGames", () => {
  it("returns an empty checked-in list when there are no check-ins", () => {
    const result = buildScheduledGames(
      [{ game_id: "g1", date: "2026-07-18", league: "saturday" }],
      [],
    );
    expect(result).toEqual([
      { gameId: "g1", date: "2026-07-18", league: "saturday", checkedInCanonicalIds: [] },
    ]);
  });

  it("only counts active (non-removed) check-ins, filtered before this function ever sees them", () => {
    // buildScheduledGames trusts its input is already filtered to active
    // rows (the removed_at is null query happens in data.ts) — this test
    // documents that contract: a row simply not present here doesn't count,
    // there's no removed_at field for this function to check itself.
    const result = buildScheduledGames(
      [{ game_id: "g1", date: "2026-07-18", league: "saturday" }],
      [{ game_id: "g1", canonical_id: "p1" }],
    );
    expect(result[0]?.checkedInCanonicalIds).toEqual(["p1"]);
  });

  it("groups check-ins by game correctly across multiple games", () => {
    const result = buildScheduledGames(
      [
        { game_id: "g1", date: "2026-07-18", league: "saturday" },
        { game_id: "g2", date: "2026-07-19", league: "sunday" },
      ],
      [
        { game_id: "g1", canonical_id: "p1" },
        { game_id: "g1", canonical_id: "p2" },
        { game_id: "g2", canonical_id: "p3" },
      ],
    );
    expect(result.find((g) => g.gameId === "g1")?.checkedInCanonicalIds).toEqual(["p1", "p2"]);
    expect(result.find((g) => g.gameId === "g2")?.checkedInCanonicalIds).toEqual(["p3"]);
  });
});
