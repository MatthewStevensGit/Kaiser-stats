import { describe, expect, it } from "vitest";
import { filterGameRecordsByYear, mergePlayerSeasonStats, rollupGameRecords, selectStatsEligibleGames } from "../game-records";
import type { GameRecord, PlayerIdentity, PlayerSeasonStats } from "../types";

const players: PlayerIdentity[] = [
  { canonicalId: "p1", displayName: "Ari Fox", aliases: [], knownEmails: [], leagues: ["sunday"], status: "regular" },
  { canonicalId: "p2", displayName: "Bex Tanaka", aliases: [], knownEmails: [], leagues: ["sunday"], status: "regular" },
  { canonicalId: "p3", displayName: "Cy Okafor", aliases: [], knownEmails: [], leagues: ["sunday"], status: "regular" },
  { canonicalId: "p4", displayName: "Dana Petrov", aliases: [], knownEmails: [], leagues: ["sunday"], status: "regular" },
];

const games: GameRecord[] = [
  {
    gameId: "g1",
    date: "2026-07-05",
    league: "sunday",
    homeRoster: [
      { canonicalId: "p1", pickNumber: 1 },
      { canonicalId: "p2", pickNumber: 4 },
    ],
    awayRoster: [
      { canonicalId: "p3", pickNumber: 2 },
      { canonicalId: "p4", pickNumber: 3 },
    ],
    homeTeamLabel: "Orange",
    awayTeamLabel: "Blue",
    homeScore: 3,
    awayScore: 1,
    goals: [
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "p2", assistCanonicalId: "p1", team: "home" },
      { scorerCanonicalId: "p3", assistCanonicalId: null, team: "away" },
    ],
    mvpCanonicalId: "p1",
    notableMentions: [{ canonicalId: "p4", quote: "Dana tracked back relentlessly all game." }],
    source: "sample-game-1",
  },
  {
    gameId: "g2",
    date: "2026-07-06",
    league: "sunday",
    homeRoster: [
      { canonicalId: "p1", pickNumber: 2 },
      { canonicalId: "p4", pickNumber: 3 },
    ],
    awayRoster: [
      { canonicalId: "p2", pickNumber: 1 },
      { canonicalId: "p3", pickNumber: 4 },
    ],
    homeTeamLabel: "Orange",
    awayTeamLabel: "Blue",
    homeScore: 2,
    awayScore: 2,
    goals: [],
    mvpCanonicalId: null,
    notableMentions: [],
    source: "sample-game-2",
  },
];

describe("rollupGameRecords", () => {
  it("produces the same PlayerSeasonStats shape aggregateStandings does", () => {
    const stats = rollupGameRecords(games, players);
    const ari = stats.find((s) => s.canonicalId === "p1");
    expect(ari).toMatchObject({
      games: 2,
      wins: 1,
      losses: 0,
      ties: 1,
      goals: 2,
      assists: 1,
      mvpCount: 1,
      plusMinus: 1,
    });
  });

  it("credits wins/losses/ties per roster side, not per player", () => {
    const stats = rollupGameRecords(games, players);
    const cy = stats.find((s) => s.canonicalId === "p3");
    // g1: away, lost 1-3 -> loss. g2: away, tied 2-2 -> tie.
    expect(cy).toMatchObject({ games: 2, wins: 0, losses: 1, ties: 1, plusMinus: -1 });
  });

  it("averages a player's draft pick number across every game they were drafted in, excluding their captain appearances", () => {
    const draftGames: GameRecord[] = [
      {
        gameId: "d1",
        date: "2026-07-05",
        league: "sunday",
        homeRoster: [
          { canonicalId: "captain-h", pickNumber: 1 },
          { canonicalId: "p1", pickNumber: 3 },
        ],
        awayRoster: [
          { canonicalId: "captain-a", pickNumber: 2 },
          { canonicalId: "p3", pickNumber: 4 },
        ],
        homeTeamLabel: "Orange",
        awayTeamLabel: "Blue",
        homeScore: 0,
        awayScore: 0,
        goals: [],
        mvpCanonicalId: null,
        notableMentions: [],
        source: "draft-game-1",
      },
      {
        gameId: "d2",
        date: "2026-07-06",
        league: "sunday",
        // p1 captains this one -- roster[0] is always a structural stand-in
        // pick, never a real draft decision, so this appearance shouldn't
        // move p1's average at all.
        homeRoster: [
          { canonicalId: "p1", pickNumber: 1 },
          { canonicalId: "captain-h2", pickNumber: 3 },
        ],
        awayRoster: [
          { canonicalId: "captain-a2", pickNumber: 2 },
          { canonicalId: "p3", pickNumber: 6 },
        ],
        homeTeamLabel: "Orange",
        awayTeamLabel: "Blue",
        homeScore: 0,
        awayScore: 0,
        goals: [],
        mvpCanonicalId: null,
        notableMentions: [],
        source: "draft-game-2",
      },
    ];
    const stats = rollupGameRecords(draftGames, players);
    // p1: real pick 3 in d1; d2's captain appearance (pick 1) is excluded entirely -> avg 3, not 2.
    expect(stats.find((s) => s.canonicalId === "p1")?.avgDraftPosition).toBe(3);
    // p3: real pick 4 in d1, real pick 6 in d2 -> avg 5.
    expect(stats.find((s) => s.canonicalId === "p3")?.avgDraftPosition).toBe(5);
    // A player who only ever captains never accumulates a real draft position.
    expect(stats.find((s) => s.canonicalId === "captain-a")?.avgDraftPosition).toBeNull();
  });

  it("returns null draft position for a player never drafted", () => {
    const stats = rollupGameRecords(
      [
        {
          gameId: "g3",
          date: "2026-07-07",
          league: "sunday",
          homeRoster: [],
          awayRoster: [],
          homeTeamLabel: "Orange",
          awayTeamLabel: "Blue",
          homeScore: 0,
          awayScore: 0,
          goals: [{ scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" }],
          mvpCanonicalId: null,
          notableMentions: [],
          source: "sample-game-3",
        },
      ],
      players,
    );
    expect(stats.find((s) => s.canonicalId === "p1")?.avgDraftPosition).toBeNull();
  });

  it("collects notable-mention quotes per player without touching mvpCount", () => {
    const stats = rollupGameRecords(games, players);
    const dana = stats.find((s) => s.canonicalId === "p4");
    expect(dana?.notableMentions).toEqual(["Dana tracked back relentlessly all game."]);
    expect(dana?.mvpCount).toBe(0);
  });

  it("falls back to the canonicalId as displayName for an unknown player", () => {
    const stats = rollupGameRecords(
      [
        {
          gameId: "g4",
          date: "2026-07-08",
          league: "sunday",
          homeRoster: [{ canonicalId: "mystery", pickNumber: 1 }],
          awayRoster: [],
          homeTeamLabel: "Orange",
          awayTeamLabel: "Blue",
          homeScore: 1,
          awayScore: 0,
          goals: [],
          mvpCanonicalId: null,
          notableMentions: [],
          source: "sample-game-4",
        },
      ],
      players,
    );
    expect(stats.find((s) => s.canonicalId === "mystery")?.displayName).toBe("mystery");
  });
});

describe("selectStatsEligibleGames", () => {
  // games[0].date = "2026-07-05", games[1].date = "2026-07-06"
  it("only includes games strictly after that year's cutoff", () => {
    const cutoffs = new Map([[2026, "2026-07-05"]]);
    const eligible = selectStatsEligibleGames(games, cutoffs, "all");
    expect(eligible.map((g) => g.gameId)).toEqual(["g2"]);
  });

  it("excludes every game for a year with no cutoff row at all (fully closed season)", () => {
    const eligible = selectStatsEligibleGames(games, new Map(), "all");
    expect(eligible).toEqual([]);
  });

  it("also filters by the requested year, on top of the cutoff", () => {
    const cutoffs = new Map([
      [2025, "2025-01-01"],
      [2026, "2026-01-01"],
    ]);
    const mixedYearGames: GameRecord[] = [
      ...games,
      { ...games[0]!, gameId: "g-2025", date: "2025-06-01" },
    ];
    expect(selectStatsEligibleGames(mixedYearGames, cutoffs, "2026").map((g) => g.gameId)).toEqual(["g1", "g2"]);
    expect(selectStatsEligibleGames(mixedYearGames, cutoffs, "2025").map((g) => g.gameId)).toEqual(["g-2025"]);
  });
});

describe("filterGameRecordsByYear", () => {
  it("keeps only games in the requested year, no cutoff involved", () => {
    const mixedYearGames: GameRecord[] = [...games, { ...games[0]!, gameId: "g-2025", date: "2025-06-01" }];
    expect(filterGameRecordsByYear(mixedYearGames, "2026").map((g) => g.gameId)).toEqual(["g1", "g2"]);
    expect(filterGameRecordsByYear(mixedYearGames, "2025").map((g) => g.gameId)).toEqual(["g-2025"]);
  });

  it("'all' returns every game regardless of year", () => {
    const mixedYearGames: GameRecord[] = [...games, { ...games[0]!, gameId: "g-2025", date: "2025-06-01" }];
    expect(filterGameRecordsByYear(mixedYearGames, "all")).toEqual(mixedYearGames);
  });
});

describe("mergePlayerSeasonStats", () => {
  function stat(overrides: Partial<PlayerSeasonStats>): PlayerSeasonStats {
    return {
      canonicalId: "p1",
      displayName: "Ari Fox",
      games: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      goals: 0,
      assists: 0,
      mvpCount: 0,
      avgDraftPosition: null,
      notableMentions: [],
      plusMinus: 0,
      sources: [],
      ...overrides,
    };
  }

  it("adds a report-side player's stats on top of their spreadsheet-side stats", () => {
    const spreadsheet = [stat({ games: 10, wins: 6, losses: 3, ties: 1, goals: 4, plusMinus: 3, sources: ["soccer_2026.xlsx"] })];
    const report = [stat({ games: 1, wins: 1, losses: 0, ties: 0, goals: 2, assists: 1, mvpCount: 1, plusMinus: 1, sources: ["email:g1"] })];

    const merged = mergePlayerSeasonStats(spreadsheet, report);
    expect(merged).toEqual([
      stat({
        games: 11,
        wins: 7,
        losses: 3,
        ties: 1,
        goals: 6,
        assists: 1,
        mvpCount: 1,
        plusMinus: 4,
        sources: ["soccer_2026.xlsx", "email:g1"],
      }),
    ]);
  });

  it("includes a player who only exists on one side untouched", () => {
    const spreadsheet = [stat({ canonicalId: "p1", games: 5 })];
    const report = [stat({ canonicalId: "p2", displayName: "Bex Tanaka", games: 1 })];

    const merged = mergePlayerSeasonStats(spreadsheet, report);
    expect(merged.find((p) => p.canonicalId === "p1")).toMatchObject({ games: 5 });
    expect(merged.find((p) => p.canonicalId === "p2")).toMatchObject({ games: 1, displayName: "Bex Tanaka" });
  });

  it("takes the report side's avgDraftPosition when the spreadsheet side's is null", () => {
    const spreadsheet = [stat({ avgDraftPosition: null })];
    const report = [stat({ avgDraftPosition: 2.5 })];
    expect(mergePlayerSeasonStats(spreadsheet, report)[0]?.avgDraftPosition).toBe(2.5);
  });
});
