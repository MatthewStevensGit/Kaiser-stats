import { describe, expect, it } from "vitest";
import { extractFirstPickAnnotation, resolveExtractionToGameRecord } from "../parse-report";
import type { RawExtraction } from "../types";
import type { PlayerIdentity } from "../../stats-engine/types";

const players: PlayerIdentity[] = [
  { canonicalId: "p1", displayName: "Ari Fox", aliases: [], knownEmails: [], leagues: ["sunday"], status: "regular" },
  { canonicalId: "p2", displayName: "Bex Tanaka", aliases: [], knownEmails: [], leagues: ["sunday"], status: "regular" },
  { canonicalId: "p3", displayName: "Cy Okafor", aliases: [], knownEmails: [], leagues: ["sunday"], status: "regular" },
];

const meta = {
  gameId: "test-game",
  source: "email:test-thread",
  fallbackDate: "2026-01-01",
  fallbackLeague: "sunday" as const,
};

describe("resolveExtractionToGameRecord", () => {
  it("resolves exact names to canonicalIds and computes the goal-sum check correctly", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: ["Ari Fox", "Bex Tanaka"],
      awayRosterRaw: ["Cy Okafor"],
      homeScore: 2,
      awayScore: 1,
      goals: [
        { scorerRaw: "Ari Fox", assistRaw: "Bex Tanaka", team: "home" },
        { scorerRaw: "Ari Fox", assistRaw: null, team: "home" },
        { scorerRaw: "Cy Okafor", assistRaw: null, team: "away" },
      ],
      mvpRaw: "Ari Fox",
      notableMentions: [],
    };

    const result = resolveExtractionToGameRecord(extraction, players, meta);
    expect(result.gameRecord.homeRoster).toEqual([{ canonicalId: "p1", pickNumber: null }, { canonicalId: "p2", pickNumber: null }]);
    expect(result.gameRecord.mvpCanonicalId).toBe("p1");
    expect(result.goalSumMismatch).toBe(false);
    expect(result.provisionedPlayers).toHaveLength(0);
    expect(result.flaggedNames).toHaveLength(0);
  });

  it("flags goal-sum mismatches instead of silently trusting the parse", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: [],
      awayRosterRaw: [],
      homeScore: 3,
      awayScore: 0,
      goals: [{ scorerRaw: "Ari Fox", assistRaw: null, team: "home" }],
      mvpRaw: null,
      notableMentions: [],
    };

    const result = resolveExtractionToGameRecord(extraction, players, meta);
    expect(result.goalSumMismatch).toBe(true);
  });

  it("auto-provisions a genuinely novel scorer name instead of dropping the goal", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: [],
      awayRosterRaw: [],
      homeScore: 1,
      awayScore: 0,
      goals: [{ scorerRaw: "Mystery Guest", assistRaw: null, team: "home" }],
      mvpRaw: null,
      notableMentions: [],
    };

    const result = resolveExtractionToGameRecord(extraction, players, meta);
    expect(result.provisionedPlayers).toHaveLength(1);
    expect(result.provisionedPlayers[0]?.displayName).toBe("Mystery Guest");
    expect(result.gameRecord.goals[0]?.scorerCanonicalId).toBe(result.provisionedPlayers[0]?.canonicalId);
  });

  it("excludes a flagged (ambiguous) MVP name rather than guessing which player it is", () => {
    const flaggedPlayers: PlayerIdentity[] = [
      ...players,
      { canonicalId: "p4", displayName: "Gena", aliases: [], knownEmails: [], leagues: ["sunday"], status: "regular" },
    ];
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: [],
      awayRosterRaw: [],
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: "Gera", // one edit away from "Gena" — a different, existing player
      notableMentions: [],
    };

    const result = resolveExtractionToGameRecord(extraction, flaggedPlayers, meta);
    expect(result.gameRecord.mvpCanonicalId).toBeNull();
    expect(result.flaggedNames).toHaveLength(1);
    expect(result.flaggedNames[0]?.raw).toBe("Gera");
  });

  it("computes real pick numbers for a game with a confirmed first-pick annotation", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: ["Bex Tanaka", "Cy Okafor"],
      awayRosterRaw: ["Ari Fox"],
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: null,
      notableMentions: [],
    };

    // Away's first-listed player ("Ari Fox") actually picked first.
    const result = resolveExtractionToGameRecord(extraction, players, meta, "Ari Fox");
    expect(result.firstPickWarning).toBeNull();
    expect(result.gameRecord.awayRoster).toEqual([{ canonicalId: "p1", pickNumber: 1 }]);
    expect(result.gameRecord.homeRoster).toEqual([
      { canonicalId: "p2", pickNumber: 2 },
      { canonicalId: "p3", pickNumber: 4 },
    ]);
  });

  it("leaves pick numbers null and warns when the first-pick annotation matches neither roster", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: ["Bex Tanaka"],
      awayRosterRaw: ["Cy Okafor"],
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: null,
      notableMentions: [],
    };

    const result = resolveExtractionToGameRecord(extraction, players, meta, "Ari Fox");
    expect(result.firstPickWarning).toContain("Ari Fox");
    expect(result.gameRecord.homeRoster[0]?.pickNumber).toBeNull();
    expect(result.gameRecord.awayRoster[0]?.pickNumber).toBeNull();
  });

  it("no annotation at all leaves every pick number null, unchanged from before", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: ["Ari Fox"],
      awayRosterRaw: ["Bex Tanaka"],
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: null,
      notableMentions: [],
    };

    const result = resolveExtractionToGameRecord(extraction, players, meta);
    expect(result.firstPickWarning).toBeNull();
    expect(result.gameRecord.homeRoster[0]?.pickNumber).toBeNull();
    expect(result.gameRecord.awayRoster[0]?.pickNumber).toBeNull();
  });
});

describe("extractFirstPickAnnotation", () => {
  it("pulls the annotation out and strips it from what gets sent to the model", () => {
    const raw = "First pick: Ari Fox\n\nVadim: 24 people, first half...";
    const { firstPickRaw, threadText } = extractFirstPickAnnotation(raw);
    expect(firstPickRaw).toBe("Ari Fox");
    expect(threadText).not.toContain("First pick");
    expect(threadText).toContain("Vadim: 24 people");
  });

  it("returns null when there's no annotation, text unchanged", () => {
    const raw = "Vadim: 24 people, first half...";
    const { firstPickRaw, threadText } = extractFirstPickAnnotation(raw);
    expect(firstPickRaw).toBeNull();
    expect(threadText).toBe(raw);
  });
});
