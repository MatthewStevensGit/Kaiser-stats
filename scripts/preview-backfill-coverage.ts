// Read-only preview of what `npm run backfill` would do — parses every real
// spreadsheet under private/ and private/incoming/ and reports row counts,
// plus/minus mismatches, and identity-resolution outcomes, without writing
// anything to Supabase or touching private data in any other way. Useful for
// checking identity-table coverage before running a real backfill.
//
// Usage: npm run backfill:preview
import { parse as parseCsv } from "csv-parse/sync";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { findPlusMinusMismatches } from "../src/lib/stats-engine/aggregate";
import { createProvisionalIdentity, resolvePlayerName } from "../src/lib/stats-engine/identity";
import { parsePrimaryStandingsSheet } from "../src/lib/stats-engine/season-standings-parser";
import type { League, PlayerIdentity } from "../src/lib/stats-engine/types";

const PRIVATE_DIR = path.join(process.cwd(), "private");

function loadPlayerIdentities(): PlayerIdentity[] {
  const csv = readFileSync(path.join(PRIVATE_DIR, "kaiser_player_identity.csv"), "utf-8");
  const rows: Record<string, string>[] = parseCsv(csv, { columns: true, skip_empty_lines: true });
  return rows
    .filter((row) => row.status !== "example")
    .map((row) => ({
      canonicalId: row.canonical_id ?? "",
      displayName: row.display_name ?? "",
      aliases: (row.aliases_seen_in_reports_rosters ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      knownEmails: [],
      leagues: (row.league ?? "").split(";").map((s) => s.trim()).filter((l): l is League => l === "saturday" || l === "sunday"),
      status: (row.status as PlayerIdentity["status"]) ?? "regular",
    }));
}

const players = loadPlayerIdentities();
console.log(`${players.length} known players.\n`);

const dirs = [PRIVATE_DIR, path.join(PRIVATE_DIR, "incoming")];
const files: string[] = [];
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name.toLowerCase().endsWith(".xlsx")) files.push(path.join(dir, name));
  }
}

let totalRows = 0;
let totalFlagged = 0;
let totalMismatches = 0;
const flaggedSamples: string[] = [];
// Tracked across all files, same as the real backfill script — a name with
// no fuzzy match gets a stable placeholder identity, not dropped.
const provisionedPlayers = new Map<string, PlayerIdentity>();

for (const file of files) {
  const source = path.basename(file);
  const workbook = XLSX.read(readFileSync(file));
  const rows = parsePrimaryStandingsSheet(workbook, source, "unknown");

  if (rows.length === 0) {
    console.log(`${source}: NO STANDINGS SHEET FOUND`);
    continue;
  }

  const mismatches = findPlusMinusMismatches(rows);
  totalMismatches += mismatches.length;

  let flaggedThisFile = 0;
  for (const row of rows) {
    const resolution = resolvePlayerName(row.playerNameRaw, [...players, ...provisionedPlayers.values()]);
    if (resolution.status === "flagged") {
      flaggedThisFile += 1;
      totalFlagged += 1;
      if (flaggedSamples.length < 25) {
        const best = resolution.candidates[0];
        flaggedSamples.push(
          `${source}: "${row.playerNameRaw}"` + (best ? ` (closest match: ${best.displayName}, distance ${best.distance})` : ""),
        );
      }
    } else if (resolution.status === "unresolved") {
      const key = row.playerNameRaw.trim().toLowerCase();
      if (!provisionedPlayers.has(key)) {
        provisionedPlayers.set(key, createProvisionalIdentity(row.playerNameRaw));
      }
    }
  }

  totalRows += rows.length;
  console.log(`${source}: ${rows.length} rows, ${flaggedThisFile} flagged (ambiguous) names, ${mismatches.length} plus/minus mismatches`);
}

console.log(`\n=== TOTALS ===`);
console.log(`Files: ${files.length}`);
console.log(`Rows: ${totalRows}`);
console.log(`Plus/minus mismatches: ${totalMismatches}`);
console.log(`New players that would be auto-tracked (unique, no confirmation needed): ${provisionedPlayers.size}`);
console.log(`Rows flagged as ambiguous — need a human decision: ${totalFlagged}`);
console.log(`\nSample flagged (ambiguous) names:`);
flaggedSamples.forEach((s) => console.log(" -", s));
