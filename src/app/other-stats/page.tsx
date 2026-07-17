import { listGameRecords, listPlayers } from "@/lib/stats-engine/data";
import { filterGameRecordsByYear, rollupGameRecords } from "@/lib/stats-engine/game-records";
import { PillTabs } from "../_components/PillTabs";

type OtherStatsTab = "assists" | "draft-position";

// Same real seasons as the Table/Past Matches pages' YEARS lists — assists
// and avgDraftPosition never existed in the spreadsheet backfill at all (see
// PlayerSeasonStats' doc comments), so unlike the Table's +/- and Golden
// Boot, every report-imported game counts here regardless of
// season_stats_cutoff — a backfilled old game updates these exactly the
// same as a brand-new one.
const ALL_YEARS_ID = "all";
const YEARS = ["2026", "2025", "2024", "2023", "2022", ALL_YEARS_ID];
const DEFAULT_YEAR = "2026";

function isOtherStatsTab(value: string | undefined): value is OtherStatsTab {
  return value === "assists" || value === "draft-position";
}

function isYear(value: string | undefined): value is string {
  return value !== undefined && YEARS.includes(value);
}

export default async function OtherStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string }>;
}) {
  const { tab: rawTab, year: rawYear } = await searchParams;
  const tab: OtherStatsTab = isOtherStatsTab(rawTab) ? rawTab : "assists";
  const year = isYear(rawYear) ? rawYear : DEFAULT_YEAR;

  const [players, allGames] = await Promise.all([listPlayers(), listGameRecords()]);
  const totals = rollupGameRecords(filterGameRecordsByYear(allGames, year), players);

  const assistsRanked = totals
    .filter((p) => p.assists > 0)
    .sort((a, b) => b.assists - a.assists || a.displayName.localeCompare(b.displayName));

  const draftPositionRanked = totals
    .filter((p): p is typeof p & { avgDraftPosition: number } => p.avgDraftPosition !== null)
    .sort((a, b) => a.avgDraftPosition - b.avgDraftPosition || a.displayName.localeCompare(b.displayName));

  return (
    <main>
      <PillTabs
        activeId={tab}
        tabs={[
          { id: "assists", label: "Assists", href: `/other-stats?tab=assists&year=${year}` },
          { id: "draft-position", label: "Draft Position", href: `/other-stats?tab=draft-position&year=${year}` },
        ]}
      />

      <PillTabs
        activeId={year}
        tabs={YEARS.map((y) => ({
          id: y,
          label: y === ALL_YEARS_ID ? "All Years" : y,
          href: `/other-stats?tab=${tab}&year=${y}`,
        }))}
      />

      {tab === "assists" &&
        (assistsRanked.length === 0 ? (
          <div className="empty-state">
            No assists recorded yet — this only ever comes from imported match reports, never
            the season spreadsheets.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th className="num">Assists</th>
                </tr>
              </thead>
              <tbody>
                {assistsRanked.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <a href={`/players/${p.canonicalId}`} className="leaderboard-name">
                        {p.displayName}
                      </a>
                    </td>
                    <td className="num">{p.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "draft-position" &&
        (draftPositionRanked.length === 0 ? (
          <div className="empty-state">
            No draft order known yet — this only ever comes from imported match reports, never
            the season spreadsheets.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th className="num">Avg. Pick</th>
                </tr>
              </thead>
              <tbody>
                {draftPositionRanked.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <a href={`/players/${p.canonicalId}`} className="leaderboard-name">
                        {p.displayName}
                      </a>
                    </td>
                    <td className="num">{p.avgDraftPosition.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </main>
  );
}
