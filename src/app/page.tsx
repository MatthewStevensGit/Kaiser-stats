import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { aggregateStandings, findPlusMinusMismatches } from "@/lib/stats-engine/aggregate";
import { rollupGameRecords } from "@/lib/stats-engine/game-records";
import { computePowerRankings } from "@/lib/stats-engine/rankings";
import { parsePrimaryStandingsSheet } from "@/lib/stats-engine/season-standings-parser";
import type { GameRecord, PlayerIdentity, StatsView } from "@/lib/stats-engine/types";

const MIN_GAMES_FOR_RANKING = 2;
const MVP_MIN_GAMES = 2;

function formatDraftPosition(avgDraftPosition: number | null): string {
  return avgDraftPosition === null ? "—" : `#${avgDraftPosition.toFixed(1)}`;
}

/**
 * Disparity is display-only, computed from the rank computePowerRankings()
 * already produced — never a second ranking, never fed back into the sort.
 */
function formatDisparity(draftDisparity: number | null): { label: string; tone: "good" | "warning" | "muted" } {
  if (draftDisparity === null) return { label: "No draft data", tone: "muted" };
  const rounded = Math.round(draftDisparity);
  if (Math.abs(rounded) <= 1) return { label: "On par with draft slot", tone: "muted" };
  return rounded > 0
    ? { label: `▼ Underperforming by ${rounded}`, tone: "warning" }
    : { label: `▲ Overperforming by ${Math.abs(rounded)}`, tone: "good" };
}

const VIEWS: { id: StatsView; label: string }[] = [
  { id: "merged", label: "Merged" },
  { id: "saturday", label: "Saturday" },
  { id: "sunday", label: "Sunday" },
];

function loadSampleData() {
  const dataDir = path.join(process.cwd(), "data", "sample");
  const players: PlayerIdentity[] = JSON.parse(
    readFileSync(path.join(dataDir, "players.json"), "utf-8"),
  );
  const workbook = XLSX.read(readFileSync(path.join(dataDir, "sample_season.xlsx")));
  const rows = parsePrimaryStandingsSheet(workbook, "sample-season", "sunday");
  const games: GameRecord[] = JSON.parse(readFileSync(path.join(dataDir, "games.json"), "utf-8"));
  return { players, rows, games };
}

function isStatsView(value: string | undefined): value is StatsView {
  return value === "merged" || value === "saturday" || value === "sunday";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: rawView } = await searchParams;
  const view: StatsView = isStatsView(rawView) ? rawView : "merged";

  const { players, rows, games } = loadSampleData();
  const { players: totals, unresolvedNames } = aggregateStandings(rows, players, view);
  const mismatches = findPlusMinusMismatches(rows.filter((r) => view === "merged" || r.league === view));

  const gameStats = rollupGameRecords(
    games.filter((g) => view === "merged" || g.league === view),
    players,
  );
  // Power ranking is computed from the GameRecord path, not the spreadsheet
  // path — draft position and notable mentions only exist at per-game
  // granularity, which season-standings spreadsheets never had (see
  // docs/data-contract.md).
  const rankings = computePowerRankings(gameStats, MIN_GAMES_FOR_RANKING);
  const mvpBoard = [...gameStats]
    .filter((p) => p.games >= MVP_MIN_GAMES && p.mvpCount > 0)
    .sort((a, b) => b.mvpCount - a.mvpCount);
  const assistBoard = [...gameStats].filter((p) => p.assists > 0).sort((a, b) => b.assists - a.assists);
  const mentionBoard = [...gameStats].filter((p) => p.notableMentions.length > 0);

  const totalGames = totals.reduce((sum, p) => sum + p.games, 0);
  const totalGoals = totals.reduce((sum, p) => sum + p.goals, 0);
  const standingsByGames = [...totals].sort((a, b) => b.games - a.games);

  return (
    <main>
      <div className="demo-banner" role="note">
        <span aria-hidden="true">●</span>
        <span>
          Demo mode: every number on this page is fake, made-up sample data — not Vadim&apos;s
          real Kaiser league. See the <a href="/rules">rulebook</a> for how the real thing works.
        </span>
      </div>

      <header className="page-header">
        <div className="page-header-row">
          <h1>Kaiser Stats</h1>
          <a href="/rules" className="rulebook-link">
            📖 Rulebook
          </a>
        </div>
        <p className="subtitle">
          Phase 1 stats engine demo. Real player data lives locally, gitignored — never in
          this repo.
        </p>
      </header>

      <nav className="tabs" aria-label="Stats view">
        {VIEWS.map((v) => (
          <a
            key={v.id}
            href={v.id === "merged" ? "/" : `/?view=${v.id}`}
            className={v.id === view ? "tab tab-active" : "tab"}
            aria-current={v.id === view ? "page" : undefined}
          >
            {v.label}
          </a>
        ))}
      </nav>

      {totals.length > 0 && (
        <section className="stat-tiles" aria-label="Season totals">
          <div className="stat-tile">
            <span className="stat-tile-value">{totals.length}</span>
            <span className="stat-tile-label">Players</span>
          </div>
          <div className="stat-tile">
            <span className="stat-tile-value">{totalGames}</span>
            <span className="stat-tile-label">Games logged</span>
          </div>
          <div className="stat-tile">
            <span className="stat-tile-value">{totalGoals}</span>
            <span className="stat-tile-label">Goals</span>
          </div>
        </section>
      )}

      {totals.length === 0 ? (
        <section>
          <div className="empty-state">
            No games recorded for the {VIEWS.find((v) => v.id === view)?.label} view in this
            dataset. The fake sample only carries data for one league — try{" "}
            <a href="/">Merged</a>.
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>Season standings</h2>
            <p className="note">From the historical season-standings backfill path.</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th className="num">Games</th>
                    <th className="num">W</th>
                    <th className="num">L</th>
                    <th className="num">T</th>
                    <th className="num">Goals</th>
                    <th className="num">+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {standingsByGames.map((p) => (
                    <tr key={p.canonicalId}>
                      <td>{p.displayName}</td>
                      <td className="num">{p.games}</td>
                      <td className="num">{p.wins}</td>
                      <td className="num">{p.losses}</td>
                      <td className="num">{p.ties}</td>
                      <td className="num">{p.goals}</td>
                      <td className="num">{p.plusMinus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>Power ranking</h2>
            <p className="note">
              {rankings.formula}, minimum {rankings.minGames} games. From the same sample
              game data as MVP &amp; assists below — draft position only exists at
              per-game granularity, so this table (unlike Season standings above) reads
              from the <code>GameRecord</code> pipeline.
            </p>
            <p className="note">
              &quot;Avg. Draft Position&quot; and the disparity column are shown for
              context only — sort order stays performance-only (plus-minus per game); draft
              position is never a ranking input, see the <a href="/rules">rulebook</a>.
            </p>
            {rankings.entries.length === 0 ? (
              <p className="note">No player has reached the minimum-games floor yet.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>Player</th>
                      <th className="num">+/- per game</th>
                      <th className="num">Avg. Draft Position</th>
                      <th>Vs. draft slot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.entries.map((e) => {
                      const disparity = formatDisparity(e.draftDisparity);
                      return (
                        <tr key={e.canonicalId} className={e.rank === 1 ? "rank-first" : undefined}>
                          <td className="num">{e.rank}</td>
                          <td>{e.displayName}</td>
                          <td className="num">{e.plusMinusPerGame.toFixed(2)}</td>
                          <td className="num">{formatDraftPosition(e.avgDraftPosition)}</td>
                          <td>
                            <span className={`status-tag status-tag-text status-${disparity.tone}`}>
                              {disparity.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2>MVP &amp; assists</h2>
            <p className="note">
              From five fake sample games run through the future per-game pipeline (
              <code>GameRecord</code> → <code>rollupGameRecords()</code>) — this is what the
              live report-parsing step will eventually feed with real data. MVP requires at
              least {MVP_MIN_GAMES} games played.
            </p>
            <div className="two-col">
              <div>
                <h3>MVP count</h3>
                {mvpBoard.length === 0 ? (
                  <p className="note">No MVP calls in this view yet.</p>
                ) : (
                  <ul className="rank-list">
                    {mvpBoard.map((p) => (
                      <li key={p.canonicalId}>
                        <span>{p.displayName}</span>
                        <span className="num">{p.mvpCount}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3>Assists</h3>
                <p className="note">
                  Tracked, never used in MVP or power ranking — see the{" "}
                  <a href="/rules">rulebook</a>.
                </p>
                {assistBoard.length === 0 ? (
                  <p className="note">No assists in this view yet.</p>
                ) : (
                  <ul className="rank-list">
                    {assistBoard.map((p) => (
                      <li key={p.canonicalId}>
                        <span>{p.displayName}</span>
                        <span className="num">{p.assists}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Notable mentions</h2>
            <p className="note">
              Verbatim report-narrative snippets naming a player — qualitative context
              only, same reasoning as assists: mentions are sparse and inconsistent (only
              show up when a report happens to narrate a moment), so they&apos;re never
              scored or folded into MVP or the power ranking above.
            </p>
            {mentionBoard.length === 0 ? (
              <p className="note">No notable mentions in this view yet.</p>
            ) : (
              <ul className="mention-list">
                {mentionBoard.map((p) => (
                  <li key={p.canonicalId}>
                    <strong>{p.displayName}</strong>
                    <ul>
                      {p.notableMentions.map((quote) => (
                        <li key={quote}>&quot;{quote}&quot;</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="card">
        <h2>Data-quality flags</h2>
        <p className="note">
          The engine never silently guesses — mismatches and unresolved names are surfaced
          for a human to confirm instead of being auto-corrected or dropped.
        </p>

        <h3>Plus/minus mismatches</h3>
        {mismatches.length === 0 ? (
          <p className="note">None in this view.</p>
        ) : (
          <ul className="flag-list">
            {mismatches.map((m) => (
              <li key={m.playerNameRaw}>
                <span className="status-tag status-critical">
                  <span aria-hidden="true">⚠</span> mismatch
                </span>
                <strong>{m.playerNameRaw}</strong>: stated {m.statedPlusMinus}, expected{" "}
                {m.expectedPlusMinus} ({m.wins}W − {m.losses}L)
              </li>
            ))}
          </ul>
        )}

        <h3>Unresolved / flagged names</h3>
        {unresolvedNames.length === 0 ? (
          <p className="note">None in this view.</p>
        ) : (
          <ul className="flag-list">
            {unresolvedNames.map((n) => (
              <li key={n.raw}>
                <span
                  className={
                    n.status === "flagged" ? "status-tag status-warning" : "status-tag status-critical"
                  }
                >
                  <span aria-hidden="true">{n.status === "flagged" ? "?" : "✕"}</span> {n.status}
                </span>
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
