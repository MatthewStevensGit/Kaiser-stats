import { listGameRecords, listPlayers } from "@/lib/stats-engine/data";
import { filterGameRecordsByYear, rollupGameRecords } from "@/lib/stats-engine/game-records";
import { SortableHeader } from "../_components/SortableHeader";
import type { SortDir } from "../_components/SortableHeader";
import { TabSelect } from "../_components/TabSelect";

type OtherStatsTab = "assists" | "draft-position";

// Each tab has exactly one sortable numeric column, so there's no separate sort-key
// param here (unlike the Table page's multi-column tabs) — just a dir toggle.
// Assists defaults high-to-low (more is better); draft position defaults low-to-high
// (an early pick, i.e. a low average, is the notable end of that stat).
const ASSISTS_DEFAULT_DIR: SortDir = "desc";
const DRAFT_POSITION_DEFAULT_DIR: SortDir = "asc";

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

function isSortDir(value: string | undefined): value is SortDir {
  return value === "asc" || value === "desc";
}

export default async function OtherStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string; dir?: string }>;
}) {
  const { tab: rawTab, year: rawYear, dir: rawDir } = await searchParams;
  const tab: OtherStatsTab = isOtherStatsTab(rawTab) ? rawTab : "assists";
  const year = isYear(rawYear) ? rawYear : DEFAULT_YEAR;
  const defaultDir = tab === "assists" ? ASSISTS_DEFAULT_DIR : DRAFT_POSITION_DEFAULT_DIR;
  const dir: SortDir = isSortDir(rawDir) ? rawDir : defaultDir;
  const sign = dir === "asc" ? 1 : -1;

  const [players, allGames] = await Promise.all([listPlayers(), listGameRecords()]);
  const totals = rollupGameRecords(filterGameRecordsByYear(allGames, year), players);

  const assistsRanked = totals
    .filter((p) => p.assists > 0)
    .sort((a, b) => sign * (a.assists - b.assists) || a.displayName.localeCompare(b.displayName));

  const draftPositionRanked = totals
    .filter((p): p is typeof p & { avgDraftPosition: number } => p.avgDraftPosition !== null)
    .sort(
      (a, b) => sign * (a.avgDraftPosition - b.avgDraftPosition) || a.displayName.localeCompare(b.displayName),
    );

  return (
    <main>
      <div className="tab-select-row">
        <TabSelect
          value={year}
          ariaLabel="Year"
          options={YEARS.map((y) => ({
            id: y,
            label: y === ALL_YEARS_ID ? "All Years" : y,
            href: `/other-stats?tab=${tab}&year=${y}`,
          }))}
        />
        <TabSelect
          value={tab}
          ariaLabel="View"
          options={[
            { id: "assists", label: "Assists", href: `/other-stats?tab=assists&year=${year}` },
            { id: "draft-position", label: "Draft Position", href: `/other-stats?tab=draft-position&year=${year}` },
          ]}
        />
      </div>

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
                  <SortableHeader
                    label="Assists"
                    href={`/other-stats?tab=${tab}&year=${year}&dir=${dir === "desc" ? "asc" : "desc"}`}
                    isActive
                    dir={dir}
                  />
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
                  <SortableHeader
                    label="Avg. Pick"
                    href={`/other-stats?tab=${tab}&year=${year}&dir=${dir === "desc" ? "asc" : "desc"}`}
                    isActive
                    dir={dir}
                  />
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
