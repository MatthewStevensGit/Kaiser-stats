import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parsePrimaryStandingsSheet } from "@/lib/stats-engine/season-standings-parser";
import type { GameRecord, PlayerIdentity, SeasonStandingRow } from "@/lib/stats-engine/types";

/** Loads the fake/anonymized demo dataset the public site runs against — never real data. */
export function loadSampleData(): {
  players: PlayerIdentity[];
  rows: SeasonStandingRow[];
  games: GameRecord[];
} {
  const dataDir = path.join(process.cwd(), "data", "sample");
  const players: PlayerIdentity[] = JSON.parse(
    readFileSync(path.join(dataDir, "players.json"), "utf-8"),
  );
  const workbook = XLSX.read(readFileSync(path.join(dataDir, "sample_season.xlsx")));
  const rows = parsePrimaryStandingsSheet(workbook, "sample-season", "sunday");
  const games: GameRecord[] = JSON.parse(readFileSync(path.join(dataDir, "games.json"), "utf-8"));
  return { players, rows, games };
}
