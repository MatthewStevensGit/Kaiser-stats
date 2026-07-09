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
    homeRoster: ["p1", "p2"],
    awayRoster: ["p3", "p4"],
    homeScore: 3,
    awayScore: 1,
    goals: [
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "p2", assistCanonicalId: "p1", team: "home" },
      { scorerCanonicalId: "p3", assistCanonicalId: null, team: "away" },
    ],
    mvpCanonicalId: "p1",
    source: "sample-game-1",
  },
  {
    gameId: "g2",
    date: "2026-07-06",
    league: "sunday",
    homeRoster: ["p1", "p4"],
    awayRoster: ["p2", "p3"],
    homeScore: 2,
    awayScore: 2,
    goals: [],
    mvpCanonicalId: null,
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

  it("falls back to the canonicalId as displayName for an unknown player", () => {
    const stats = rollupGameRecords(
      [
        {
          gameId: "g3",
          date: "2026-07-07",
          league: "sunday",
          homeRoster: ["mystery"],
          awayRoster: [],
          homeScore: 1,
          awayScore: 0,
          goals: [],
          mvpCanonicalId: null,
          source: "sample-game-3",
        },
      ],
      players,
    );
    expect(stats.find((s) => s.canonicalId === "mystery")?.displayName).toBe("mystery");
  });
});
