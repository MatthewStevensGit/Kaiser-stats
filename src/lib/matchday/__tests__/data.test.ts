import { describe, expect, it } from "vitest";
import { buildScheduledGames, filterRosterForPicker } from "../data";

function gameRow(overrides: Partial<Parameters<typeof buildScheduledGames>[0][number]> = {}) {
  return {
    game_id: "g1",
    date: "2026-07-18",
    league: "saturday" as const,
    kickoff_label: null,
    venue: null,
    cancelled_at: null,
    registration_cutoff_override: null,
    ...overrides,
  };
}

describe("buildScheduledGames", () => {
  it("returns an empty checked-in list when there are no check-ins", () => {
    const result = buildScheduledGames([gameRow()], []);
    expect(result).toEqual([
      {
        gameId: "g1",
        date: "2026-07-18",
        league: "saturday",
        checkedInCanonicalIds: [],
        kickoffLabel: "7:00 AM ET",
        venue: "Kaiser Park",
        cancelled: false,
        cutoffOverrideUtc: null,
      },
    ]);
  });

  it("only counts active (non-removed) check-ins, filtered before this function ever sees them", () => {
    // buildScheduledGames trusts its input is already filtered to active
    // rows (the removed_at is null query happens in data.ts) — this test
    // documents that contract: a row simply not present here doesn't count,
    // there's no removed_at field for this function to check itself.
    const result = buildScheduledGames(
      [gameRow()],
      [{ game_id: "g1", canonical_id: "p1" }],
    );
    expect(result[0]?.checkedInCanonicalIds).toEqual(["p1"]);
  });

  it("groups check-ins by game correctly across multiple games", () => {
    const result = buildScheduledGames(
      [gameRow(), gameRow({ game_id: "g2", date: "2026-07-19", league: "sunday" })],
      [
        { game_id: "g1", canonical_id: "p1" },
        { game_id: "g1", canonical_id: "p2" },
        { game_id: "g2", canonical_id: "p3" },
      ],
    );
    expect(result.find((g) => g.gameId === "g1")?.checkedInCanonicalIds).toEqual(["p1", "p2"]);
    expect(result.find((g) => g.gameId === "g2")?.checkedInCanonicalIds).toEqual(["p3"]);
  });

  it("falls back to the league-wide kickoff/venue constants when a game has no override", () => {
    const result = buildScheduledGames([gameRow({ league: "sunday" })], []);
    expect(result[0]).toMatchObject({ kickoffLabel: "7:30 AM ET", venue: "Brielle" });
  });

  it("uses a game's own kickoff/venue override instead of the league constant when present", () => {
    const result = buildScheduledGames(
      [gameRow({ kickoff_label: "8:00 AM ET", venue: "Kaiser Park (holiday slot)" })],
      [],
    );
    expect(result[0]).toMatchObject({ kickoffLabel: "8:00 AM ET", venue: "Kaiser Park (holiday slot)" });
  });

  it("marks a game cancelled when cancelled_at is set", () => {
    const result = buildScheduledGames([gameRow({ cancelled_at: "2026-07-10T12:00:00.000Z" })], []);
    expect(result[0]?.cancelled).toBe(true);
  });

  it("marks a game not cancelled when cancelled_at is null", () => {
    const result = buildScheduledGames([gameRow()], []);
    expect(result[0]?.cancelled).toBe(false);
  });

  it("parses a registration_cutoff_override into a Date", () => {
    const result = buildScheduledGames(
      [gameRow({ registration_cutoff_override: "2026-07-17T21:00:00.000Z" })],
      [],
    );
    expect(result[0]?.cutoffOverrideUtc).toEqual(new Date("2026-07-17T21:00:00.000Z"));
  });

  it("leaves cutoffOverrideUtc null when there's no override", () => {
    const result = buildScheduledGames([gameRow()], []);
    expect(result[0]?.cutoffOverrideUtc).toBeNull();
  });
});

describe("filterRosterForPicker", () => {
  const rows = [
    { canonical_id: "p1", display_name: "Ari Fox", roster_name: "Ari Fox", known_emails: [], status: "regular" },
    { canonical_id: "p2", display_name: "Removed Guy", roster_name: null, known_emails: [], status: "deferred" },
    {
      canonical_id: "auto-mikeginzburg-yahoo-com",
      display_name: "mikeginzburg@yahoo.com",
      roster_name: null,
      known_emails: ["mikeginzburg@yahoo.com"],
      status: "provisional",
    },
    { canonical_id: "p3", display_name: "Boris K", roster_name: null, known_emails: [], status: "regular" },
    // A genuinely new teammate seen for the first time in a pasted roster —
    // auto-provisioned the same "provisional" status as a login stub, but
    // with no known email at all (createProvisionalIdentity never sets one).
    // Must NEVER be excluded just because nobody's set a roster name yet —
    // this is the exact regression a real user hit (5 real checked-in
    // players silently vanishing from the draft pool).
    { canonical_id: "auto-mussa", display_name: "Mussa", roster_name: null, known_emails: [], status: "provisional" },
  ];

  it("excludes deferred players", () => {
    const result = filterRosterForPicker(rows, []);
    expect(result.some((p) => p.canonicalId === "p2")).toBe(false);
  });

  it("excludes an unresolved login stub (a raw email with no roster name set)", () => {
    const result = filterRosterForPicker(rows, []);
    expect(result.some((p) => p.canonicalId === "auto-mikeginzburg-yahoo-com")).toBe(false);
    expect(result.some((p) => p.displayName === "mikeginzburg@yahoo.com")).toBe(false);
  });

  it("keeps a genuinely new provisional teammate with no known email (not a login stub)", () => {
    const result = filterRosterForPicker(rows, []);
    expect(result.some((p) => p.canonicalId === "auto-mussa")).toBe(true);
  });

  it("excludes explicitly excluded canonicalIds (already checked in / already in pool)", () => {
    const result = filterRosterForPicker(rows, ["p1"]);
    expect(result.some((p) => p.canonicalId === "p1")).toBe(false);
  });

  it("keeps regular players not otherwise excluded", () => {
    const result = filterRosterForPicker(rows, []);
    expect(result.map((p) => p.canonicalId)).toEqual(["p1", "p3", "auto-mussa"]);
  });
});
