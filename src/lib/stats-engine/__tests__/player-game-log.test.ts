import { describe, expect, it } from "vitest";
import { resultForSide } from "../game-records";
import { getPlayerGameLog } from "../player-game-log";
import type { GameRecord } from "../types";

const games: GameRecord[] = [
  {
    gameId: "g1",
    date: "2026-07-05",
    league: "sunday",
    homeRoster: [{ canonicalId: "p1", pickNumber: 1 }],
    awayRoster: [{ canonicalId: "p2", pickNumber: 2 }],
    homeScore: 3,
    awayScore: 1,
    goals: [
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "p1", assistCanonicalId: null, team: "home" },
      { scorerCanonicalId: "p2", assistCanonicalId: null, team: "away" },
    ],
    mvpCanonicalId: "p1",
    notableMentions: [],
    source: "sample-game-1",
  },
  {
    gameId: "g2",
    date: "2026-07-12",
    league: "sunday",
    homeRoster: [{ canonicalId: "p2", pickNumber: 1 }],
    awayRoster: [{ canonicalId: "p1", pickNumber: 2 }],
    homeScore: 2,
    awayScore: 2,
    goals: [{ scorerCanonicalId: "p1", assistCanonicalId: null, team: "away" }],
    mvpCanonicalId: null,
    notableMentions: [],
    source: "sample-game-2",
  },
];

describe("getPlayerGameLog", () => {
  it("returns an empty log for a player absent from every game", () => {
    expect(getPlayerGameLog("nobody", games)).toEqual([]);
  });

  it("derives side, result, and per-game goal count from roster + goals", () => {
    const log = getPlayerGameLog("p1", games);
    expect(log).toHaveLength(2);
    // Most recent first: g2 (2026-07-12) before g1 (2026-07-05).
    expect(log[0]).toMatchObject({ gameId: "g2", side: "away", result: "draw", goals: 1 });
    expect(log[1]).toMatchObject({ gameId: "g1", side: "home", result: "win", goals: 2, isMvp: true });
  });

  it("counts goals per-game, not summed across games", () => {
    const log = getPlayerGameLog("p2", games);
    const g1Entry = log.find((e) => e.gameId === "g1");
    const g2Entry = log.find((e) => e.gameId === "g2");
    expect(g1Entry).toMatchObject({ side: "away", result: "loss", goals: 1 });
    expect(g2Entry).toMatchObject({ side: "home", result: "draw", goals: 0 });
  });

  it("flags isMvp only for the game where this player was the determined MVP", () => {
    const log = getPlayerGameLog("p2", games);
    expect(log.find((e) => e.gameId === "g1")?.isMvp).toBe(false);
    expect(getPlayerGameLog("p1", games).find((e) => e.gameId === "g1")?.isMvp).toBe(true);
  });
});

describe("resultForSide", () => {
  it("returns win for the home side when home outscores away", () => {
    expect(resultForSide(3, 1, "home")).toBe("win");
    expect(resultForSide(3, 1, "away")).toBe("loss");
  });

  it("returns win for the away side when away outscores home", () => {
    expect(resultForSide(1, 3, "away")).toBe("win");
    expect(resultForSide(1, 3, "home")).toBe("loss");
  });

  it("returns draw for either side on a tie", () => {
    expect(resultForSide(2, 2, "home")).toBe("draw");
    expect(resultForSide(2, 2, "away")).toBe("draw");
  });
});
