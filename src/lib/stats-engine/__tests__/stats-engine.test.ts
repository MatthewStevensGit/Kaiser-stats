import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  aggregateStandings,
  computeSeasonAwards,
  filterSeasonStandingRowsByYear,
  findPlusMinusMismatches,
  rankByRate,
  tallyAwardCounts,
} from "../aggregate";
import { resolvePlayerName } from "../identity";
import { computePowerRankings } from "../rankings";
import { parseAllStandingsSheets, parsePrimaryStandingsSheet } from "../season-standings-parser";
import type { PlayerIdentity, SeasonStandingRow } from "../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const samplePlayers: PlayerIdentity[] = JSON.parse(
  readFileSync(path.join(__dirname, "../../../../data/sample/players.json"), "utf-8"),
);

function loadSampleWorkbook() {
  const buf = readFileSync(path.join(__dirname, "../../../../data/sample/sample_season.xlsx"));
  return XLSX.read(buf, { type: "buffer" });
}

describe("season-standings-parser", () => {
  it("parses the primary standings sheet, ignoring near-duplicate/single-purpose sheets", () => {
    const wb = loadSampleWorkbook();
    const rows = parsePrimaryStandingsSheet(wb, "sample", "sunday");
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.playerNameRaw)).toContain("Ari Fox");
    expect(rows.find((r) => r.playerNameRaw === "Ari Fox")?.goals).toBe(14);
  });

  it("can still parse every sheet individually when asked", () => {
    const wb = loadSampleWorkbook();
    const bySheet = parseAllStandingsSheets(wb, "sample", "sunday");
    expect(bySheet.map((s) => s.sheetName)).toEqual(["Sheet1", "Sheet2", "Sheet3"]);
    // Sheet3 (goals-only) has no GAMES column, so it correctly parses to nothing.
    expect(bySheet.find((s) => s.sheetName === "Sheet3")?.rows).toHaveLength(0);
  });
});

describe("aggregate: plus-minus validation", () => {
  it("flags a stated plus/minus that doesn't equal wins minus losses", () => {
    const wb = loadSampleWorkbook();
    const rows = parsePrimaryStandingsSheet(wb, "sample", "sunday");
    const mismatches = findPlusMinusMismatches(rows);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.playerNameRaw).toBe("Theo Lindqvist");
    expect(mismatches[0]?.expectedPlusMinus).toBe(0);
    expect(mismatches[0]?.statedPlusMinus).toBe(5);
  });
});

describe("identity: name resolution never auto-merges", () => {
  it("resolves an exact alias match", () => {
    const res = resolvePlayerName("Ari Fox", samplePlayers);
    expect(res.status).toBe("exact");
    expect(res.canonicalId).toBe("s001");
  });

  it("flags a one-letter misspelling instead of silently matching it", () => {
    const res = resolvePlayerName("Robyn Achebe", samplePlayers);
    expect(res.status).toBe("flagged");
    expect(res.canonicalId).toBeNull();
    expect(res.candidates[0]?.canonicalId).toBe("s006");
  });

  it("leaves a genuinely unknown name unresolved rather than guessing", () => {
    const res = resolvePlayerName("Mystery Guest", samplePlayers);
    expect(res.status).toBe("unresolved");
    expect(res.candidates).toHaveLength(0);
  });
});

describe("aggregateStandings", () => {
  it("sums totals for resolved players and keeps a flagged (ambiguous) name out of everyone's totals", () => {
    const wb = loadSampleWorkbook();
    const rows = parsePrimaryStandingsSheet(wb, "sample", "sunday");
    const { players, unresolvedNames } = aggregateStandings(rows, samplePlayers, "merged");

    const ari = players.find((p) => p.canonicalId === "s001");
    expect(ari?.games).toBe(20);
    expect(ari?.goals).toBe(14);

    // Robyn is a misspelling flagged against a DIFFERENT existing player
    // (Robin Achebe) — real misattribution risk, so it's excluded and
    // surfaced for a human, never silently folded into anyone's totals.
    expect(players.find((p) => p.canonicalId === "s006")).toBeUndefined();
    const flagged = unresolvedNames.map((n) => n.raw);
    expect(flagged).toContain("Robyn Achebe");
    expect(flagged).not.toContain("Mystery Guest");
  });

  it("auto-provisions a genuinely novel name (no fuzzy match to anything) instead of dropping it", () => {
    const wb = loadSampleWorkbook();
    const rows = parsePrimaryStandingsSheet(wb, "sample", "sunday");
    const { players, provisionedPlayers } = aggregateStandings(rows, samplePlayers, "merged");

    // "Mystery Guest" has no fuzzy match to any known player — no risk of
    // misattributing someone else's stats, so it gets its own stable
    // identity and its 2 games/1 goal count immediately.
    const provisioned = provisionedPlayers.find((p) => p.displayName === "Mystery Guest");
    expect(provisioned).toBeDefined();
    expect(provisioned?.status).toBe("provisional");

    const stats = players.find((p) => p.canonicalId === provisioned?.canonicalId);
    expect(stats).toMatchObject({ games: 2, wins: 1, losses: 1, goals: 1 });
  });

  it("only includes rows matching the requested league view", () => {
    const wb = loadSampleWorkbook();
    const rows = parsePrimaryStandingsSheet(wb, "sample", "saturday");
    const { players } = aggregateStandings(rows, samplePlayers, "sunday");
    expect(players).toHaveLength(0);
  });
});

describe("filterSeasonStandingRowsByYear", () => {
  const rowFor = (source: string): SeasonStandingRow => ({
    source,
    league: "sunday",
    playerNameRaw: "Someone",
    games: 1,
    wins: 1,
    losses: 0,
    ties: 0,
    goals: null,
    plusMinus: null,
    percent: null,
    points: null,
  });

  it("keeps only rows whose source embeds the requested year", () => {
    const rows = [rowFor("soccer_2023.xlsx#Sheet1"), rowFor("soccer_2025_1.xlsx#Sheet1")];
    expect(filterSeasonStandingRowsByYear(rows, "2023")).toEqual([rows[0]]);
  });

  it("'all' returns every row unfiltered — today's existing all-time behavior", () => {
    const rows = [rowFor("soccer_2023.xlsx#Sheet1"), rowFor("soccer_2025_1.xlsx#Sheet1")];
    expect(filterSeasonStandingRowsByYear(rows, "all")).toEqual(rows);
  });
});

describe("computeSeasonAwards / tallyAwardCounts", () => {
  const seasonPlayers: PlayerIdentity[] = [
    { canonicalId: "p1", displayName: "Ari Fox", aliases: [], knownEmails: [], leagues: ["sunday"], status: "regular" },
    { canonicalId: "p2", displayName: "Bex Tanaka", aliases: [], knownEmails: [], leagues: ["sunday"], status: "regular" },
  ];

  function rowFor(playerNameRaw: string, wins: number, losses: number, goals: number, games = 5): SeasonStandingRow {
    return {
      source: "soccer_2023.xlsx#Sheet1",
      league: "sunday",
      playerNameRaw,
      games,
      wins,
      losses,
      ties: 0,
      goals,
      plusMinus: wins - losses,
      percent: null,
      points: null,
    };
  }

  it("awards the league title (top +/-) and Golden Boot (most goals, min-games floor) to the right player", () => {
    const rows = [rowFor("Ari Fox", 4, 1, 10), rowFor("Bex Tanaka", 2, 3, 3)];
    const award = computeSeasonAwards(rows, seasonPlayers, 2023, 3);
    expect(award).toEqual({ year: 2023, leagueWinnerIds: ["p1"], goldenBootWinnerIds: ["p1"] });
  });

  it("splits the award between tied players rather than picking one arbitrarily", () => {
    const rows = [rowFor("Ari Fox", 3, 2, 5), rowFor("Bex Tanaka", 3, 2, 5)];
    const award = computeSeasonAwards(rows, seasonPlayers, 2023, 3);
    expect(award.leagueWinnerIds.sort()).toEqual(["p1", "p2"]);
    expect(award.goldenBootWinnerIds.sort()).toEqual(["p1", "p2"]);
  });

  it("excludes a player under the Golden Boot's minimum-games floor from winning it", () => {
    const rows = [rowFor("Ari Fox", 4, 1, 10, 2), rowFor("Bex Tanaka", 2, 3, 3, 5)];
    const award = computeSeasonAwards(rows, seasonPlayers, 2023, 3);
    expect(award.goldenBootWinnerIds).toEqual(["p2"]);
  });

  it("tallies league titles and Golden Boots per player across multiple seasons", () => {
    const awards = [
      { year: 2022, leagueWinnerIds: ["p1"], goldenBootWinnerIds: ["p2"] },
      { year: 2023, leagueWinnerIds: ["p1"], goldenBootWinnerIds: ["p1"] },
    ];
    const tally = tallyAwardCounts(awards);
    expect(tally.get("p1")).toEqual({ leagueTitles: 2, goldenBoots: 1 });
    expect(tally.get("p2")).toEqual({ leagueTitles: 0, goldenBoots: 1 });
  });
});

describe("rankByRate and computePowerRankings apply a minimum-games floor", () => {
  it("excludes low-sample players from a rate leaderboard", () => {
    const wb = loadSampleWorkbook();
    const rows = parsePrimaryStandingsSheet(wb, "sample", "sunday");
    const { players } = aggregateStandings(rows, samplePlayers, "merged");

    const unfiltered = rankByRate(players, "goals", 0);
    expect(unfiltered.map((p) => p.canonicalId)).toContain("s004"); // Dana Petrov, 5 games

    const filtered = rankByRate(players, "goals", 10);
    expect(filtered.map((p) => p.canonicalId)).not.toContain("s004");
  });

  it("computes a transparent, disclosed power-ranking formula", () => {
    const wb = loadSampleWorkbook();
    const rows = parsePrimaryStandingsSheet(wb, "sample", "sunday");
    const { players } = aggregateStandings(rows, samplePlayers, "merged");

    const { formula, entries } = computePowerRankings(players, 10);
    expect(formula).toMatch(/plus-minus per game/);
    expect(entries.every((e) => e.games >= 10)).toBe(true);
    expect(entries[0]?.rank).toBe(1);
  });
});
