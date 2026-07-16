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
      homeTeamLabelRaw: null,
      awayTeamLabelRaw: null,
      homeScore: 2,
      awayScore: 1,
      goals: [
        { scorerRaw: "Ari Fox", assistRaw: "Bex Tanaka", team: "home" },
        { scorerRaw: "Ari Fox", assistRaw: null, team: "home" },
        { scorerRaw: "Cy Okafor", assistRaw: null, team: "away" },
      ],
      mvpRaw: "Ari Fox",
      notableMentions: [],
      pickOrderRaw: null,
    };

    const result = resolveExtractionToGameRecord(extraction, players, meta);
    expect(result.gameRecord.homeRoster).toEqual([{ canonicalId: "p1", pickNumber: 1 }, { canonicalId: "p2", pickNumber: 3 }]);
    expect(result.gameRecord.mvpCanonicalId).toBe("p1");
    expect(result.goalSumMismatch).toBe(false);
    expect(result.provisionedPlayers).toHaveLength(0);
    expect(result.flaggedNames).toHaveLength(0);
    expect(result.gameRecord.homeTeamLabel).toBe("Orange");
    expect(result.gameRecord.awayTeamLabel).toBe("Blue");
  });

  it("uses the report's own stated team names instead of the Orange/Blue default when given", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: [],
      awayRosterRaw: [],
      homeTeamLabelRaw: "Orange",
      awayTeamLabelRaw: "Blue",
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: null,
      notableMentions: [],
      pickOrderRaw: null,
    };

    const result = resolveExtractionToGameRecord(extraction, players, meta);
    expect(result.gameRecord.homeTeamLabel).toBe("Orange");
    expect(result.gameRecord.awayTeamLabel).toBe("Blue");
  });

  it("flags goal-sum mismatches instead of silently trusting the parse", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: [],
      awayRosterRaw: [],
      homeTeamLabelRaw: null,
      awayTeamLabelRaw: null,
      homeScore: 3,
      awayScore: 0,
      goals: [{ scorerRaw: "Ari Fox", assistRaw: null, team: "home" }],
      mvpRaw: null,
      notableMentions: [],
      pickOrderRaw: null,
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
      homeTeamLabelRaw: null,
      awayTeamLabelRaw: null,
      homeScore: 1,
      awayScore: 0,
      goals: [{ scorerRaw: "Mystery Guest", assistRaw: null, team: "home" }],
      mvpRaw: null,
      notableMentions: [],
      pickOrderRaw: null,
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
      homeTeamLabelRaw: null,
      awayTeamLabelRaw: null,
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: "Gera", // one edit away from "Gena" — a different, existing player
      notableMentions: [],
      pickOrderRaw: null,
    };

    const result = resolveExtractionToGameRecord(extraction, flaggedPlayers, meta);
    expect(result.gameRecord.mvpCanonicalId).toBeNull();
    expect(result.flaggedNames).toHaveLength(1);
    expect(result.flaggedNames[0]?.raw).toBe("Gera");
  });

  it("defaults to alternating pick numbers for every game, even with no annotation at all", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: ["Ari Fox"],
      awayRosterRaw: ["Bex Tanaka"],
      homeTeamLabelRaw: null,
      awayTeamLabelRaw: null,
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: null,
      notableMentions: [],
      pickOrderRaw: null,
    };

    // Team listed first (home) is assumed to have picked first — a
    // confirmed league convention, not a guess (see parse-report.ts's
    // resolveExtractionToGameRecord doc comment).
    const result = resolveExtractionToGameRecord(extraction, players, meta);
    expect(result.firstPickWarning).toBeNull();
    expect(result.pickOrderWarning).toBeNull();
    expect(result.gameRecord.homeRoster[0]?.pickNumber).toBe(1);
    expect(result.gameRecord.awayRoster[0]?.pickNumber).toBe(2);
  });

  it("computes real pick numbers for a game with a confirmed first-pick annotation, overriding the default", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: ["Bex Tanaka", "Cy Okafor"],
      awayRosterRaw: ["Ari Fox"],
      homeTeamLabelRaw: null,
      awayTeamLabelRaw: null,
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: null,
      notableMentions: [],
      pickOrderRaw: null,
    };

    // Away's first-listed player ("Ari Fox") actually picked first — contradicts the default.
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
      homeTeamLabelRaw: null,
      awayTeamLabelRaw: null,
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: null,
      notableMentions: [],
      pickOrderRaw: null,
    };

    const result = resolveExtractionToGameRecord(extraction, players, meta, "Ari Fox");
    expect(result.firstPickWarning).toContain("Ari Fox");
    expect(result.gameRecord.homeRoster[0]?.pickNumber).toBeNull();
    expect(result.gameRecord.awayRoster[0]?.pickNumber).toBeNull();
  });

  it("overrides the default with a narrated pick order when the report states one explicitly (real worked example)", () => {
    // Real convention confirmed by the league organizer: first-listed player
    // on each side is that team's captain (not part of the snake sequence);
    // the report narrated "Nick Brazil selected first, then Alan, then Josh,
    // then Emre and Matthew (together), then Oleg" — a non-strictly-
    // alternating order (Emre/Matthew go back-to-back) that the default
    // alone couldn't produce.
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: ["Vadim", "Nick Brazil", "Josh", "Oleg"],
      awayRosterRaw: ["Alik", "Alan", "Emre", "Matthew"],
      homeTeamLabelRaw: null,
      awayTeamLabelRaw: null,
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: null,
      notableMentions: [],
      pickOrderRaw: ["Nick Brazil", "Alan", "Josh", ["Emre", "Matthew"], "Oleg"],
    };

    const result = resolveExtractionToGameRecord(extraction, players, meta);
    expect(result.pickOrderWarning).toBeNull();
    expect(result.gameRecord.homeRoster).toEqual([
      { canonicalId: "auto-vadim", pickNumber: 1 },
      { canonicalId: "auto-nick-brazil", pickNumber: 3 },
      { canonicalId: "auto-josh", pickNumber: 5 },
      { canonicalId: "auto-oleg", pickNumber: 8 },
    ]);
    expect(result.gameRecord.awayRoster).toEqual([
      { canonicalId: "auto-alik", pickNumber: 2 },
      { canonicalId: "auto-alan", pickNumber: 4 },
      { canonicalId: "auto-emre", pickNumber: 6 },
      { canonicalId: "auto-matthew", pickNumber: 7 },
    ]);
  });

  it("warns but keeps going when the narrated pick order names someone off either roster", () => {
    const extraction: RawExtraction = {
      date: "2026-07-05",
      league: "sunday",
      homeRosterRaw: ["Ari Fox", "Bex Tanaka"],
      awayRosterRaw: ["Cy Okafor"],
      homeTeamLabelRaw: null,
      awayTeamLabelRaw: null,
      homeScore: 0,
      awayScore: 0,
      goals: [],
      mvpRaw: null,
      notableMentions: [],
      pickOrderRaw: ["Someone Else", "Bex Tanaka"],
    };

    const result = resolveExtractionToGameRecord(extraction, players, meta);
    expect(result.pickOrderWarning).toContain("Someone Else");
    expect(result.gameRecord.homeRoster.find((s) => s.canonicalId === "p2")?.pickNumber).toBe(4);
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
