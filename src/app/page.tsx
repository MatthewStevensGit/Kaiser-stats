import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { aggregateStandings, findPlusMinusMismatches } from "@/lib/stats-engine/aggregate";
import { computePowerRankings } from "@/lib/stats-engine/rankings";
import { parsePrimaryStandingsSheet } from "@/lib/stats-engine/season-standings-parser";
import type { PlayerIdentity } from "@/lib/stats-engine/types";

const MIN_GAMES_FOR_RANKING = 10;

function loadSampleData() {
  const dataDir = path.join(process.cwd(), "data", "sample");
  const players: PlayerIdentity[] = JSON.parse(
    readFileSync(path.join(dataDir, "players.json"), "utf-8"),
  );
  const workbook = XLSX.read(readFileSync(path.join(dataDir, "sample_season.xlsx")));
  const rows = parsePrimaryStandingsSheet(workbook, "sample-season", "sunday");
  return { players, rows };
}

export default function Home() {
  const { players, rows } = loadSampleData();
  const { players: totals, unresolvedNames } = aggregateStandings(rows, players, "merged");
  const mismatches = findPlusMinusMismatches(rows);
  const rankings = computePowerRankings(totals, MIN_GAMES_FOR_RANKING);

  return (
    <main>
      <h1>Kaiser Stats</h1>
      <p className="subtitle">
        Phase 1 stats engine demo, running against a fake/anonymized sample dataset
        (<code>data/sample/</code>). Real player data lives locally, gitignored — never
        in this repo.
      </p>

      <section>
        <h2>Season standings (merged view)</h2>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Games</th>
              <th>W</th>
              <th>L</th>
              <th>T</th>
              <th>Goals</th>
              <th>+/-</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((p) => (
              <tr key={p.canonicalId}>
                <td>{p.displayName}</td>
                <td>{p.games}</td>
                <td>{p.wins}</td>
                <td>{p.losses}</td>
                <td>{p.ties}</td>
                <td>{p.goals}</td>
                <td>{p.plusMinus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Power ranking</h2>
        <p className="note">{rankings.formula}, minimum {rankings.minGames} games.</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>+/- per game</th>
            </tr>
          </thead>
          <tbody>
            {rankings.entries.map((e) => (
              <tr key={e.canonicalId}>
                <td>{e.rank}</td>
                <td>{e.displayName}</td>
                <td>{e.plusMinusPerGame.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Data-quality flags</h2>
        <p className="note">
          The engine never silently guesses — mismatches and unresolved names are
          surfaced for a human to confirm instead of being auto-corrected or dropped.
        </p>
        <h3>Plus/minus mismatches</h3>
        {mismatches.length === 0 ? (
          <p className="note">None in this dataset.</p>
        ) : (
          <ul>
            {mismatches.map((m) => (
              <li key={m.playerNameRaw}>
                <strong>{m.playerNameRaw}</strong>: stated {m.statedPlusMinus}, expected{" "}
                {m.expectedPlusMinus} ({m.wins}W − {m.losses}L)
              </li>
            ))}
          </ul>
        )}

        <h3>Unresolved / flagged names</h3>
        {unresolvedNames.length === 0 ? (
          <p className="note">None in this dataset.</p>
        ) : (
          <ul>
            {unresolvedNames.map((n) => (
              <li key={n.raw}>
                <span className="tag">{n.status}</span>
                <strong>{n.raw}</strong>
                {n.candidates.length > 0 && (
                  <>
                    {" "}
                    — possible match: {n.candidates[0]?.displayName} (edit distance{" "}
                    {n.candidates[0]?.distance})
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
