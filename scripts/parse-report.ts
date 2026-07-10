// Parses a single report email (saved as a local .txt file) into a
// GameRecord using Gemini + our own identity-resolution code. Prints the
// result — does not write to Supabase. This is the first real exercise of
// the report-parsing pipeline described in kaiser_BUILD_SPEC.md.
//
// Usage: npm run parse-report -- path/to/report.txt

import { config } from "dotenv";
config({ path: ".env.local" });
import { parse as parseCsv } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractFirstPickAnnotation, parseReportText, resolveExtractionToGameRecord } from "../src/lib/report-parser/parse-report";
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

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run parse-report -- path/to/report.txt");
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY must be set in .env.local");

  const rawFileText = readFileSync(filePath, "utf-8");
  const { firstPickRaw, threadText } = extractFirstPickAnnotation(rawFileText);
  const players = loadPlayerIdentities();
  console.log(`Loaded ${players.length} known players. Parsing ${filePath}...`);
  if (firstPickRaw) console.log(`Found "First pick: ${firstPickRaw}" annotation.`);
  console.log();

  const extraction = await parseReportText(apiKey, threadText);
  const resolved = resolveExtractionToGameRecord(
    extraction,
    players,
    {
      gameId: path.basename(filePath, ".txt"),
      source: `email:${path.basename(filePath, ".txt")}`,
      fallbackDate: new Date().toISOString().slice(0, 10),
      fallbackLeague: "unknown",
    },
    firstPickRaw,
  );

  console.log("=== Extracted GameRecord ===");
  console.log(JSON.stringify(resolved.gameRecord, null, 2));

  if (resolved.firstPickWarning) {
    console.log(`\n=== First-pick annotation warning ===`);
    console.log(resolved.firstPickWarning);
  }

  console.log(`\n=== Goal-sum check ===`);
  console.log(
    resolved.goalSumMismatch
      ? "MISMATCH — scorer counts per team don't sum to the stated score. Flag for review, don't trust this parse's goals."
      : "OK — scorer counts match the stated score.",
  );

  console.log(`\n=== Auto-tracked new players (${resolved.provisionedPlayers.length}) ===`);
  resolved.provisionedPlayers.forEach((p) => console.log(` - ${p.displayName} (${p.canonicalId})`));

  console.log(`\n=== Flagged names needing a human decision (${resolved.flaggedNames.length}) ===`);
  resolved.flaggedNames.forEach((n) => {
    const best = n.candidates[0];
    console.log(` - "${n.raw}"` + (best ? ` (closest match: ${best.displayName}, distance ${best.distance})` : ""));
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
