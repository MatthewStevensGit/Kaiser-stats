// Backfills real historical spreadsheets (private/*.xlsx, private/incoming/*.xlsx)
// into Supabase, via the existing stats-engine parser/identity-resolution
// code — this script does not re-implement any parsing logic, it only reads
// files, calls into src/lib/stats-engine/, and writes the result.
//
// Local/private use only. Requires .env.local with SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (see .env.example). Never runs as part of the
// deployed app or CI. Safe to re-run: each source file's rows are replaced,
// not duplicated.
//
// Usage: npm run backfill

import { config } from "dotenv";
config({ path: ".env.local" });
import { parse as parseCsv } from "csv-parse/sync";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { createProvisionalIdentity, resolvePlayerName } from "../src/lib/stats-engine/identity";
import { parsePrimaryStandingsSheet } from "../src/lib/stats-engine/season-standings-parser";
import { findPlusMinusMismatches } from "../src/lib/stats-engine/aggregate";
import { createServiceRoleClient } from "../src/lib/supabase/client";
import type { League, PlayerIdentity } from "../src/lib/stats-engine/types";

const PRIVATE_DIR = path.join(process.cwd(), "private");
const IDENTITY_CSV = path.join(PRIVATE_DIR, "kaiser_player_identity.csv");

function requireField(row: Record<string, string>, key: string): string {
  const value = row[key];
  if (!value) throw new Error(`kaiser_player_identity.csv: missing required column "${key}" on row ${JSON.stringify(row)}`);
  return value;
}

function loadPlayerIdentities(): PlayerIdentity[] {
  const csv = readFileSync(IDENTITY_CSV, "utf-8");
  const rows: Record<string, string>[] = parseCsv(csv, { columns: true, skip_empty_lines: true });

  return rows
    .filter((row) => row.status !== "example") // the Alexander Gart row is documentation, not a real player
    .map((row) => ({
      canonicalId: requireField(row, "canonical_id"),
      displayName: requireField(row, "display_name"),
      aliases: (row.aliases_seen_in_reports_rosters ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      knownEmails: (row.known_emails ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      leagues: (row.league ?? "").split(";").map((s) => s.trim()).filter((l): l is League =>
        l === "saturday" || l === "sunday",
      ),
      status: (row.status as PlayerIdentity["status"]) ?? "regular",
    }));
}

function findSpreadsheetFiles(): string[] {
  const dirs = [PRIVATE_DIR, path.join(PRIVATE_DIR, "incoming")];
  const files: string[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.toLowerCase().endsWith(".xlsx")) files.push(path.join(dir, name));
    }
  }
  return files;
}

/** Guess a league from the filename until real per-file league metadata exists. */
function guessLeague(filePath: string): League {
  const name = path.basename(filePath).toLowerCase();
  if (name.includes("sat")) return "saturday";
  if (name.includes("sun")) return "sunday";
  return "unknown";
}

async function main() {
  const players = loadPlayerIdentities();
  console.log(`Loaded ${players.length} known player identities.`);

  const files = findSpreadsheetFiles();
  if (files.length === 0) {
    console.log("No .xlsx files found under private/ or private/incoming/. Nothing to do.");
    return;
  }

  const supabase = createServiceRoleClient();

  console.log(`Upserting ${players.length} known players...`);
  const { error: playersError } = await supabase.from("players").upsert(
    players.map((p) => ({
      canonical_id: p.canonicalId,
      display_name: p.displayName,
      aliases: p.aliases,
      known_emails: p.knownEmails,
      leagues: p.leagues,
      status: p.status,
    })),
  );
  if (playersError) throw new Error(`Failed to upsert players: ${playersError.message}`);

  // Names with no fuzzy match to anything (status "unresolved") carry no
  // misattribution risk, so they get a stable auto-provisioned identity
  // instead of being dropped — see createProvisionalIdentity in identity.ts.
  // Tracked across the whole run so "Boris Def" gets the same canonicalId
  // every time it's seen, in every file.
  const provisionedPlayers = new Map<string, PlayerIdentity>();

  let totalRows = 0;
  let totalFlagged = 0;
  let totalProvisioned = 0;

  for (const file of files) {
    const source = path.basename(file);
    const league = guessLeague(file);
    const workbook = XLSX.read(readFileSync(file));
    const rows = parsePrimaryStandingsSheet(workbook, source, league);

    if (rows.length === 0) {
      console.warn(`  ${source}: no standings sheet found, skipping.`);
      continue;
    }

    const mismatches = findPlusMinusMismatches(rows);
    for (const m of mismatches) {
      console.warn(
        `  ${source}: PLUS/MINUS mismatch for "${m.playerNameRaw}" — stated ${m.statedPlusMinus}, expected ${m.expectedPlusMinus}`,
      );
    }

    // parsePrimaryStandingsSheet stores each row's source as "<file>#<sheetName>"
    // (see season-standings-parser.ts), not the bare filename used above — this
    // must match that exact string, or the delete below silently matches zero
    // rows and every re-run appends a full duplicate copy instead of replacing
    // it (a real bug that shipped rows tripled for every file before this fix).
    const rowSource = rows[0]?.source ?? source;

    // Re-runnable: replace this source's rows rather than accumulating duplicates.
    const { error: deleteError } = await supabase.from("season_standing_rows").delete().eq("source", rowSource);
    if (deleteError) throw new Error(`Failed to clear old rows for ${source}: ${deleteError.message}`);

    const dbRows = [];
    for (const row of rows) {
      const resolution = resolvePlayerName(row.playerNameRaw, [...players, ...provisionedPlayers.values()]);
      let canonicalId: string | null = resolution.status === "exact" ? resolution.canonicalId : null;

      if (resolution.status === "flagged") {
        // Close to a DIFFERENT existing name — real misattribution risk if
        // guessed wrong. Held out, logged for a human to confirm.
        totalFlagged += 1;
        const best = resolution.candidates[0];
        console.warn(
          `  ${source}: flagged name "${row.playerNameRaw}"` +
            (best ? ` (closest match: ${best.displayName}, distance ${best.distance})` : ""),
        );

        const { data: existing } = await supabase
          .from("unresolved_names_log")
          .select("id")
          .eq("raw_name", row.playerNameRaw)
          .eq("source", source)
          .is("resolved_at", null)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from("unresolved_names_log").insert({
            raw_name: row.playerNameRaw,
            status: resolution.status,
            candidate_canonical_id: best?.canonicalId ?? null,
            candidate_distance: best?.distance ?? null,
            source,
          });
        }
      } else if (resolution.status === "unresolved") {
        // No match to anything at all — no risk of misattributing someone
        // else's stats, so auto-provision a stable identity instead of
        // dropping the row.
        const key = row.playerNameRaw.trim().toLowerCase();
        let provisional = provisionedPlayers.get(key);
        if (!provisional) {
          provisional = createProvisionalIdentity(row.playerNameRaw);
          provisionedPlayers.set(key, provisional);
          totalProvisioned += 1;
          console.log(`  ${source}: auto-tracking new player "${row.playerNameRaw}" (${provisional.canonicalId})`);
        }
        canonicalId = provisional.canonicalId;
      }

      dbRows.push({
        source: row.source,
        league: row.league,
        player_name_raw: row.playerNameRaw,
        player_canonical_id: canonicalId,
        games: row.games,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        goals: row.goals,
        plus_minus: row.plusMinus,
        percent: row.percent,
        points: row.points,
      });
    }

    // Provisional players referenced by this file's rows must exist before
    // the FK-constrained insert below. Upserting the whole accumulated map
    // each time is redundant but cheap and always correct.
    if (provisionedPlayers.size > 0) {
      const { error: provisionedError } = await supabase.from("players").upsert(
        Array.from(provisionedPlayers.values()).map((p) => ({
          canonical_id: p.canonicalId,
          display_name: p.displayName,
          aliases: p.aliases,
          known_emails: p.knownEmails,
          leagues: p.leagues,
          status: p.status,
        })),
      );
      if (provisionedError) {
        throw new Error(`Failed to upsert provisional players: ${provisionedError.message}`);
      }
    }

    const { error: insertError } = await supabase.from("season_standing_rows").insert(dbRows);
    if (insertError) throw new Error(`Failed to insert rows for ${source}: ${insertError.message}`);

    totalRows += dbRows.length;
    console.log(`  ${source}: ${dbRows.length} rows backfilled.`);
  }

  console.log(
    `\nDone. ${files.length} files processed, ${totalRows} rows backfilled.\n` +
      `${totalProvisioned} new players auto-tracked under a placeholder identity (stats already counting — attach a real name any time by adding the raw name as an alias in kaiser_player_identity.csv).\n` +
      `${totalFlagged} names flagged and need a human decision (see the unresolved_names_log table) — these are genuinely ambiguous, close to a different existing player.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
