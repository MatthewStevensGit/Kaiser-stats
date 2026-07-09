// Regenerates the fake/anonymized sample workbook used by tests and the demo
// page. No real player data — see data/sample/players.json for the matching
// fake identity table. Run with: node scripts/generate-sample-data.mjs
import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";

const mainStandings = [
  ["Number", "NAME", "GAMES", "WINS", "LOSSES", "TIES", "GOALS", "PLUS/MINUS"],
  [1, "Ari Fox", 20, 12, 5, 3, 14, 7],
  [2, "Bex Tanaka", 18, 9, 6, 3, 6, 3],
  [3, "Cy Okafor", 30, 20, 8, 2, 11, 12],
  [4, "Dana Petrov", 5, 4, 1, 0, 2, 3],
  // Intentional data-quality problems the engine is meant to catch:
  [5, "Theo Lindqvist", 10, 6, 6, 0, 3, 5], // stated +/- (5) does not match wins-losses (0)
  [6, "Robyn Achebe", 12, 7, 4, 1, 5, 3], // one-letter misspelling of "Robin Achebe" -> should be flagged, not auto-merged
  [7, "Mystery Guest", 2, 1, 1, 0, 1, 0], // no match in the identity table at all -> unresolved
];

// A near-duplicate second "full standings" sheet, mirroring the real
// workbooks' data-hygiene quirk (see kaiser_stats_engine_notes.md) — the
// parser should treat Sheet1 as primary and not double-count Sheet2.
const secondaryStandings = [
  ["Number", "NAME", "GAMES", "WINS", "LOSSES", "TIES", "GOALS", "PLUS/MINUS"],
  [1, "Ari Fox", 20, 12, 5, 3, 14, 7],
];

const goalsOnly = [
  ["Number", "NAME", "GOALS"],
  [1, "Ari Fox", 14],
  [2, "Cy Okafor", 11],
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mainStandings), "Sheet1");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(secondaryStandings), "Sheet2");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(goalsOnly), "Sheet3");

writeFileSync("data/sample/sample_season.xlsx", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log("Wrote data/sample/sample_season.xlsx");
