import {
  aggregateStandings,
  computeSeasonAwards,
  filterSeasonStandingRowsByYear,
  rankByRate,
  tallyAwardCounts,
} from "@/lib/stats-engine/aggregate";
import { listGameRecords, listPlayers, listSeasonStandingRows, listSeasonStatsCutoffs } from "@/lib/stats-engine/data";
import {
  filterGameRecordsByYear,
  mergePlayerSeasonStats,
  rollupGameRecords,
  selectStatsEligibleGames,
} from "@/lib/stats-engine/game-records";
import { formatPlusMinus, formatWDL } from "@/lib/format";
import { GoldenBootChip } from "./_components/GoldenBootChip";
import { LeagueTitleChip } from "./_components/LeagueTitleChip";
import { TabSelect } from "./_components/TabSelect";

const GOLDEN_BOOT_MIN_GAMES = 3;

type TableTab = "plus-minus" | "golden-boot" | "mvp";

// Same real seasons this league has data for as the Past Matches page's
// YEARS list — "all" is an extra tab (not a real year) showing every
// season's stats summed together, i.e. today's existing all-time behavior.
const ALL_YEARS_ID = "all";
const YEARS = ["2026", "2025", "2024", "2023", "2022", ALL_YEARS_ID];
// Most recent real season, not "all" — see season_stats_cutoff's doc comment
// in supabase/schema.sql for why "all" isn't a great default once report-
// imported games start needing to merge in on top of the spreadsheet backfill.
const DEFAULT_YEAR = "2026";

function isTableTab(value: string | undefined): value is TableTab {
  return value === "plus-minus" || value === "golden-boot" || value === "mvp";
}

function isYear(value: string | undefined): value is string {
  return value !== undefined && YEARS.includes(value);
}

function plusMinusClass(value: number): string {
  if (value > 0) return "value-positive";
  if (value < 0) return "value-negative";
  return "value-neutral";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string }>;
}) {
  const { tab: rawTab, year: rawYear } = await searchParams;
  const tab: TableTab = isTableTab(rawTab) ? rawTab : "plus-minus";
  const year = isYear(rawYear) ? rawYear : DEFAULT_YEAR;

  // Merged (saturday+sunday) only, for now — league split may return in a later slice.
  const [players, allRows, allGames, cutoffs] = await Promise.all([
    listPlayers(),
    listSeasonStandingRows(),
    listGameRecords(),
    listSeasonStatsCutoffs(),
  ]);
  const rows = filterSeasonStandingRowsByYear(allRows, year);
  const { players: spreadsheetTotals } = aggregateStandings(rows, players, "merged");
  const eligibleGames = selectStatsEligibleGames(allGames, cutoffs, year);
  const reportTotals = rollupGameRecords(eligibleGames, players);
  const totals = mergePlayerSeasonStats(spreadsheetTotals, reportTotals);

  const plusMinusRanked = [...totals].sort(
    (a, b) => b.plusMinus - a.plusMinus || b.games - a.games,
  );
  const goldenBoot = rankByRate(totals, "goals", GOLDEN_BOOT_MIN_GAMES).sort(
    (a, b) => b.goals - a.goals || b.rate - a.rate,
  );

  // MVP never existed in the spreadsheet backfill at all (see
  // PlayerSeasonStats.mvpCount's doc comment) — no double-counting risk, so
  // every report-imported game for this year counts here, not just the ones
  // past season_stats_cutoff. Updates on both a brand-new game ("frontfill")
  // and an old historical report imported later ("backfill"); +/- and Golden
  // Boot above only ever move on a frontfill, since those stats are already
  // baked into the spreadsheet for anything on/before the cutoff.
  const mvpEligibleGames = filterGameRecordsByYear(allGames, year);
  const mvpTotals = rollupGameRecords(mvpEligibleGames, players);
  const mvpRanked = mvpTotals
    .filter((p) => p.mvpCount > 0)
    .sort((a, b) => b.mvpCount - a.mvpCount || a.displayName.localeCompare(b.displayName));

  // League-title/Golden-Boot trophy case, shown only on the All Years view
  // (see LeagueTitleChip/GoldenBootChip below) — only ever computed for a
  // FULLY CLOSED season (no season_stats_cutoff row at all), since an
  // in-progress season's current leader hasn't actually won anything yet.
  const closedYears = YEARS.filter((y): y is string => y !== ALL_YEARS_ID)
    .map(Number)
    .filter((y) => !cutoffs.has(y));
  const awards = closedYears.map((y) =>
    computeSeasonAwards(filterSeasonStandingRowsByYear(allRows, String(y)), players, y, GOLDEN_BOOT_MIN_GAMES),
  );
  const awardTally = tallyAwardCounts(awards);

  return (
    <main>
      <div className="tab-select-row">
        <TabSelect
          value={year}
          ariaLabel="Year"
          options={YEARS.map((y) => ({
            id: y,
            label: y === ALL_YEARS_ID ? "All Years" : y,
            href: `/?tab=${tab}&year=${y}`,
          }))}
        />
        <TabSelect
          value={tab}
          ariaLabel="View"
          options={[
            { id: "plus-minus", label: "Plus-Minus", href: `/?tab=plus-minus&year=${year}` },
            { id: "golden-boot", label: "Golden Boot", href: `/?tab=golden-boot&year=${year}` },
            { id: "mvp", label: "MVP", href: `/?tab=mvp&year=${year}` },
          ]}
        />
      </div>

      {tab === "plus-minus" &&
        (plusMinusRanked.length === 0 ? (
          <div className="empty-state">No standings in this dataset yet.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th className="num">P</th>
                  <th className="num">W-D-L</th>
                  <th className="num">+/-</th>
                </tr>
              </thead>
              <tbody>
                {plusMinusRanked.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <a href={`/players/${p.canonicalId}`} className="leaderboard-name">
                        {p.displayName}
                      </a>
                      {year === ALL_YEARS_ID && (
                        <LeagueTitleChip count={awardTally.get(p.canonicalId)?.leagueTitles ?? 0} />
                      )}
                    </td>
                    <td className="num">{p.games}</td>
                    <td className="num">{formatWDL(p.wins, p.ties, p.losses)}</td>
                    <td className={`num ${plusMinusClass(p.plusMinus)}`}>
                      {formatPlusMinus(p.plusMinus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "golden-boot" &&
        (goldenBoot.length === 0 ? (
          <div className="empty-state">
            No player has reached the minimum {GOLDEN_BOOT_MIN_GAMES} games yet.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th className="num">Goals</th>
                  <th className="num">Per game</th>
                </tr>
              </thead>
              <tbody>
                {goldenBoot.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <a href={`/players/${p.canonicalId}`} className="leaderboard-name">
                        {p.displayName}
                      </a>
                      {year === ALL_YEARS_ID && (
                        <GoldenBootChip count={awardTally.get(p.canonicalId)?.goldenBoots ?? 0} />
                      )}
                    </td>
                    <td className="num">{p.goals}</td>
                    <td className="num">{p.rate.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "mvp" &&
        (mvpRanked.length === 0 ? (
          <div className="empty-state">
            No MVPs determined yet — this only ever comes from imported match reports, never
            the season spreadsheets.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th className="num">MVP</th>
                </tr>
              </thead>
              <tbody>
                {mvpRanked.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <a href={`/players/${p.canonicalId}`} className="leaderboard-name">
                        {p.displayName}
                      </a>
                    </td>
                    <td className="num">{p.mvpCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </main>
  );
}
