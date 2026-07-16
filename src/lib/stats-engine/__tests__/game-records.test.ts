import { describe, expect, it } from "vitest";
import { rollupGameRecords } from "../game-records";
import type { GameRecord, PlayerIdentity } from "../types";

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

  it("averages a player's draft pick number across every game they were drafted in", () => {
    const stats = rollupGameRecords(games, players);
    // p1: pick 1 in g1, pick 2 in g2 -> avg 1.5
    expect(stats.find((s) => s.canonicalId === "p1")?.avgDraftPosition).toBe(1.5);
    // p3 only appears once per game but with different picks: g1 pick 2, g2 pick 4 -> avg 3
    expect(stats.find((s) => s.canonicalId === "p3")?.avgDraftPosition).toBe(3);
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
