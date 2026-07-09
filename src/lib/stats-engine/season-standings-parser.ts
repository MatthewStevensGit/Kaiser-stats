import * as XLSX from "xlsx";
import type { League, SeasonStandingRow } from "./types";

/**
 * Historical season-standings spreadsheets don't share one fixed schema across
 * years (see kaiser_stats_engine_notes.md: PERCENT/POINTS dropped in 2024/2026,
 * column order shifts, an extra leading "Number" column comes and goes). Every
 * sheet is instead read by matching header text, not fixed column positions.
 */

const HEADER_ALIASES: Record<keyof Omit<SeasonStandingRow, "source" | "league" | "playerNameRaw">, string[]> = {
  games: ["games"],
  wins: ["wins"],
  losses: ["losses"],
  ties: ["ties"],
  goals: ["goals"],
  plusMinus: ["plus/minus", "plusminus", "+/-"],
  percent: ["percent"],
  points: ["points"],
};

const NAME_HEADER = "name";
const HEADER_SEARCH_ROWS = 5;

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(HEADER_SEARCH_ROWS, rows.length); i++) {
    const row = rows[i] ?? [];
    if (row.some((cell) => String(cell ?? "").trim().toLowerCase() === NAME_HEADER)) {
      return i;
    }
  }
  return -1;
}

function buildColumnIndex(headerRow: unknown[]): Map<string, number> {
  const index = new Map<string, number>();
  headerRow.forEach((cell, i) => {
    const text = String(cell ?? "").trim().toLowerCase();
    if (text) index.set(text, i);
  });
  return index;
}

function findColumn(columnIndex: Map<string, number>, aliases: string[]): number | null {
  for (const alias of aliases) {
    const i = columnIndex.get(alias);
    if (i !== undefined) return i;
  }
  return null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * A row counts as a real standings entry only if it has a name and a games
 * count — this is what excludes the blank trailer rows every sheet has (sheets
 * are pre-sized to ~85 rows regardless of how many players actually played).
 */
function isStandingsRow(nameRaw: unknown, games: unknown): boolean {
  const name = String(nameRaw ?? "").trim();
  return name.length > 0 && toNumberOrNull(games) !== null;
}

export function parseSeasonStandingsSheet(
  sheet: XLSX.WorkSheet,
  source: string,
  league: League = "unknown",
): SeasonStandingRow[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex === -1) return [];

  const columnIndex = buildColumnIndex(rows[headerRowIndex] ?? []);
  const nameCol = columnIndex.get(NAME_HEADER);
  const gamesCol = findColumn(columnIndex, HEADER_ALIASES.games);
  if (nameCol === undefined || gamesCol === null) return [];

  const winsCol = findColumn(columnIndex, HEADER_ALIASES.wins);
  const lossesCol = findColumn(columnIndex, HEADER_ALIASES.losses);
  const tiesCol = findColumn(columnIndex, HEADER_ALIASES.ties);
  const goalsCol = findColumn(columnIndex, HEADER_ALIASES.goals);
  const plusMinusCol = findColumn(columnIndex, HEADER_ALIASES.plusMinus);
  const percentCol = findColumn(columnIndex, HEADER_ALIASES.percent);
  const pointsCol = findColumn(columnIndex, HEADER_ALIASES.points);

  const out: SeasonStandingRow[] = [];
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const nameRaw = row[nameCol];
    const games = row[gamesCol];
    if (!isStandingsRow(nameRaw, games)) continue;

    out.push({
      source,
      league,
      playerNameRaw: String(nameRaw).trim(),
      games: toNumberOrNull(games) ?? 0,
      wins: winsCol !== null ? toNumberOrNull(row[winsCol]) ?? 0 : 0,
      losses: lossesCol !== null ? toNumberOrNull(row[lossesCol]) ?? 0 : 0,
      ties: tiesCol !== null ? toNumberOrNull(row[tiesCol]) ?? 0 : 0,
      goals: goalsCol !== null ? toNumberOrNull(row[goalsCol]) : null,
      plusMinus: plusMinusCol !== null ? toNumberOrNull(row[plusMinusCol]) : null,
      percent: percentCol !== null ? toNumberOrNull(row[percentCol]) : null,
      points: pointsCol !== null ? toNumberOrNull(row[pointsCol]) : null,
    });
  }
  return out;
}

/**
 * Parses every sheet in the workbook that looks like a standings sheet (has a
 * NAME + GAMES header pair). Workbooks routinely contain duplicate/near-duplicate
 * sheets and single-purpose leaderboards (goals-only, rate-only) alongside the
 * main standings (see kaiser_stats_engine_notes.md) — this returns one array
 * per sheet for inspection; it does not decide which sheet is canonical.
 */
export function parseAllStandingsSheets(
  workbook: XLSX.WorkBook,
  source: string,
  league: League = "unknown",
): { sheetName: string; rows: SeasonStandingRow[] }[] {
  const out: { sheetName: string; rows: SeasonStandingRow[] }[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    out.push({ sheetName, rows: parseSeasonStandingsSheet(sheet, `${source}#${sheetName}`, league) });
  }
  return out;
}

/**
 * Picks the first sheet whose header row has games+wins+losses+ties (a "full
 * standings" sheet) and returns just its normalized rows. Workbooks are not
 * guaranteed to have exactly one such sheet — some years carry a near-duplicate
 * second full-standings sheet whose relationship to the first isn't resolved
 * (see kaiser_stats_engine_notes.md's "data hygiene caveat") — so this picks
 * the first match and leaves reconciling any others to a human/admin pass
 * rather than guessing which one is authoritative.
 */
export function parsePrimaryStandingsSheet(
  workbook: XLSX.WorkBook,
  source: string,
  league: League = "unknown",
): SeasonStandingRow[] {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    const headerRowIndex = findHeaderRow(rows);
    if (headerRowIndex === -1) continue;
    const columnIndex = buildColumnIndex(rows[headerRowIndex] ?? []);
    const hasFullStandings =
      columnIndex.has(NAME_HEADER) &&
      findColumn(columnIndex, HEADER_ALIASES.games) !== null &&
      findColumn(columnIndex, HEADER_ALIASES.wins) !== null &&
      findColumn(columnIndex, HEADER_ALIASES.losses) !== null &&
      findColumn(columnIndex, HEADER_ALIASES.ties) !== null;
    if (!hasFullStandings) continue;
    const parsed = parseSeasonStandingsSheet(sheet, `${source}#${sheetName}`, league);
    if (parsed.length > 0) return parsed;
  }
  return [];
}
