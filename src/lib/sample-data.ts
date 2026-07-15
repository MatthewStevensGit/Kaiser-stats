import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { ScheduledGame } from "@/lib/matchday/types";
import { parsePrimaryStandingsSheet } from "@/lib/stats-engine/season-standings-parser";
import type { GameRecord, PlayerIdentity, SeasonStandingRow } from "@/lib/stats-engine/types";

/**
 * Loads the fake/anonymized demo dataset the public site runs against —
 * never real data. `scheduledGames` is kept here as a fixture shape only —
 * as of the admin check-in slice, no live page reads it anymore (Matchday
 * reads real Supabase tables via src/lib/matchday/data.ts instead). Don't
 * let it silently become a second, drifting source of truth.
 */
export function loadSampleData(): {
  players: PlayerIdentity[];
  rows: SeasonStandingRow[];
  games: GameRecord[];
  scheduledGames: ScheduledGame[];
} {
  const dataDir = path.join(process.cwd(), "data", "sample");
  const players: PlayerIdentity[] = JSON.parse(
    readFileSync(path.join(dataDir, "players.json"), "utf-8"),
  );
  const workbook = XLSX.read(readFileSync(path.join(dataDir, "sample_season.xlsx")));
  const rows = parsePrimaryStandingsSheet(workbook, "sample-season", "sunday");
  const games: GameRecord[] = JSON.parse(readFileSync(path.join(dataDir, "games.json"), "utf-8"));
  const scheduledGames: ScheduledGame[] = JSON.parse(
    readFileSync(path.join(dataDir, "scheduled-games.json"), "utf-8"),
  );
  return { players, rows, games, scheduledGames };
}
