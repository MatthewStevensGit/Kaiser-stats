import {
  aggregateStandings,
  computeSeasonAwards,
  filterSeasonStandingRowsByYear,
  rankByRate,
  tallyAwardCounts,
} from "@/lib/stats-engine/aggregate";
import { listGameRecords, listPlayers, listSeasonStandingRows, listSeasonStatsCutoffs } from "@/lib/stats-engine/data";
import {
  computeRecentForm,
  filterGameRecordsByYear,
  mergePlayerSeasonStats,
  rollupGameRecords,
  selectStatsEligibleGames,
} from "@/lib/stats-engine/game-records";
import { formatPlusMinus, formatWDL } from "@/lib/format";
import { GoldenBootChip } from "./_components/GoldenBootChip";
import { LeagueTitleChip } from "./_components/LeagueTitleChip";
import { SortableHeader } from "./_components/SortableHeader";
import type { SortDir } from "./_components/SortableHeader";
import { TabSelect } from "./_components/TabSelect";

const GOLDEN_BOOT_MIN_GAMES = 3;

type TableTab = "plus-minus" | "golden-boot" | "mvp" | "draft-position" | "assists" | "recent-form";
type PlusMinusSort = "games" | "wins" | "plusminus";
type GoldenBootSort = "goals" | "rate";
type MvpSort = "mvp";
type DraftPositionSort = "draftposition";
type AssistsSort = "assists";
type RecentFormSort = "goals" | "assists" | "mvps" | "games" | "draftpos";

const RECENT_FORM_WINDOW = 5;

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
  return (
    value === "plus-minus" ||
    value === "golden-boot" ||
    value === "mvp" ||
    value === "draft-position" ||
    value === "assists" ||
    value === "recent-form"
  );
}

function isYear(value: string | undefined): value is string {
  return value !== undefined && YEARS.includes(value);
}

function isSortDir(value: string | undefined): value is SortDir {
  return value === "asc" || value === "desc";
}

function plusMinusClass(value: number): string {
  if (value > 0) return "value-positive";
  if (value < 0) return "value-negative";
  return "value-neutral";
}

/**
 * href for a column header: clicking an already-active column flips direction,
 * clicking a new one defaults to descending — except a column where a LOW
 * value is the notable one (e.g. avg draft position: an early pick), which
 * defaults a fresh click to ascending instead (ascendingIsBetter).
 */
function sortHref(
  tab: string,
  year: string,
  sortKey: string,
  currentSort: string,
  currentDir: SortDir,
  ascendingIsBetter = false,
): string {
  const isActive = currentSort === sortKey;
  const nextDir: SortDir = isActive ? (currentDir === "desc" ? "asc" : "desc") : ascendingIsBetter ? "asc" : "desc";
  return `/?tab=${tab}&year=${year}&sort=${sortKey}&dir=${nextDir}`;
}

/**
 * Standard "competition ranking" (1224): rows tied on whatever value is
 * being ranked by share the same, lower place number, and the next distinct
 * value skips ahead by however many rows tied for it (two players tied for
 * 24th -> the next distinct player is 26th, not 25th). "Tied" is always
 * judged against the value the table is CURRENTLY sorted by (see each tab's
 * valueOf below) — switching which column you sort by can change who's
 * considered tied with whom, confirmed as the intended behavior.
 */
function computeRanks<T>(sorted: T[], valueOf: (item: T) => number): number[] {
  const ranks: number[] = [];
  let previousValue: number | null = null;
  let previousRank = 0;
  sorted.forEach((item, i) => {
    const value = valueOf(item);
    const rank = previousValue !== null && value === previousValue ? previousRank : i + 1;
    ranks.push(rank);
    previousValue = value;
    previousRank = rank;
  });
  return ranks;
}

const PLUS_MINUS_DEFAULT_SORT: PlusMinusSort = "plusminus";
const GOLDEN_BOOT_DEFAULT_SORT: GoldenBootSort = "goals";
const MVP_DEFAULT_SORT: MvpSort = "mvp";
const DRAFT_POSITION_DEFAULT_SORT: DraftPositionSort = "draftposition";
const ASSISTS_DEFAULT_SORT: AssistsSort = "assists";
const RECENT_FORM_DEFAULT_SORT: RecentFormSort = "goals";

function isRecentFormSort(value: string | undefined): value is RecentFormSort {
  return value === "goals" || value === "assists" || value === "mvps" || value === "games" || value === "draftpos";
}

function isPlusMinusSort(value: string | undefined): value is PlusMinusSort {
  return value === "games" || value === "wins" || value === "plusminus";
}

function isGoldenBootSort(value: string | undefined): value is GoldenBootSort {
  return value === "goals" || value === "rate";
}

// Draft position is the one stat where a LOW number is notable (an early
// pick) rather than a high one, so unlike every other tab it defaults to
// ascending — same convention the old standalone Other Stats page used.
function defaultDirFor(tab: TableTab): SortDir {
  return tab === "draft-position" ? "asc" : "desc";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string; sort?: string; dir?: string }>;
}) {
  const { tab: rawTab, year: rawYear, sort: rawSort, dir: rawDir } = await searchParams;
  const tab: TableTab = isTableTab(rawTab) ? rawTab : "plus-minus";
  const year = isYear(rawYear) ? rawYear : DEFAULT_YEAR;
  const dir: SortDir = isSortDir(rawDir) ? rawDir : defaultDirFor(tab);
  const plusMinusSort: PlusMinusSort = isPlusMinusSort(rawSort) ? rawSort : PLUS_MINUS_DEFAULT_SORT;
  const goldenBootSort: GoldenBootSort = isGoldenBootSort(rawSort) ? rawSort : GOLDEN_BOOT_DEFAULT_SORT;
  const mvpSort: MvpSort = MVP_DEFAULT_SORT;
  const draftPositionSort: DraftPositionSort = DRAFT_POSITION_DEFAULT_SORT;
  const assistsSort: AssistsSort = ASSISTS_DEFAULT_SORT;
  const recentFormSort: RecentFormSort = isRecentFormSort(rawSort) ? rawSort : RECENT_FORM_DEFAULT_SORT;

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

  // Sign flips the primary key for asc/desc; the tie-break stays in its original
  // (descending) sense regardless of dir — it's just there to keep ties stable, not
  // something a user is choosing to sort by.
  const sign = dir === "asc" ? 1 : -1;
  const plusMinusRanked = [...totals].sort((a, b) => {
    if (plusMinusSort === "games") return sign * (a.games - b.games) || b.plusMinus - a.plusMinus;
    if (plusMinusSort === "wins") return sign * (a.wins - b.wins) || b.plusMinus - a.plusMinus;
    return sign * (a.plusMinus - b.plusMinus) || b.games - a.games;
  });
  const goldenBoot = rankByRate(totals, "goals", GOLDEN_BOOT_MIN_GAMES).sort((a, b) => {
    if (goldenBootSort === "rate") return sign * (a.rate - b.rate) || b.goals - a.goals;
    return sign * (a.goals - b.goals) || b.rate - a.rate;
  });
  const plusMinusRanks = computeRanks(plusMinusRanked, (p) =>
    plusMinusSort === "games" ? p.games : plusMinusSort === "wins" ? p.wins : p.plusMinus,
  );
  // Golden Boot's "Per game" column ties on the ROUNDED value shown in the table
  // (two players both displaying "1.50" should tie even if their raw floats
  // differ in an invisible decimal place) — same reasoning for avgDraftPosition below.
  const goldenBootRanks = computeRanks(goldenBoot, (p) =>
    goldenBootSort === "rate" ? Number(p.rate.toFixed(2)) : p.goals,
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
    .sort((a, b) => sign * (a.mvpCount - b.mvpCount) || a.displayName.localeCompare(b.displayName));
  const assistsRanked = mvpTotals
    .filter((p) => p.assists > 0)
    .sort((a, b) => sign * (a.assists - b.assists) || a.displayName.localeCompare(b.displayName));
  const draftPositionRanked = mvpTotals
    .filter((p): p is typeof p & { avgDraftPosition: number } => p.avgDraftPosition !== null)
    .sort(
      (a, b) => sign * (a.avgDraftPosition - b.avgDraftPosition) || a.displayName.localeCompare(b.displayName),
    );
  const mvpRanks = computeRanks(mvpRanked, (p) => p.mvpCount);
  const assistsRanks = computeRanks(assistsRanked, (p) => p.assists);
  const draftPositionRanks = computeRanks(draftPositionRanked, (p) => Number(p.avgDraftPosition.toFixed(1)));

  // Each player's own actual last RECENT_FORM_WINDOW games within the selected
  // year — not the league's last N games as a whole (see computeRecentForm's
  // doc comment). Uses the same year-filtered game set as MVP/Assists/Draft
  // Position above, for the same reason: this stat never existed in the
  // spreadsheet backfill, so there's no season_stats_cutoff to respect.
  const recentFormRanked = computeRecentForm(mvpEligibleGames, players, RECENT_FORM_WINDOW).sort((a, b) => {
    if (recentFormSort === "mvps") return sign * (a.mvpCount - b.mvpCount) || b.goals - a.goals;
    if (recentFormSort === "assists") return sign * (a.assists - b.assists) || b.goals - a.goals;
    if (recentFormSort === "games") return sign * (a.gamesPlayed - b.gamesPlayed) || b.goals - a.goals;
    if (recentFormSort === "draftpos") {
      // Nobody's actual draft-pick data is missing on purpose (only report-
      // imported games with no known pick order lack it) — always push those
      // to the bottom regardless of sort direction, same as the dedicated
      // Draft Position tab excluding them outright.
      if (a.avgDraftPosition === null && b.avgDraftPosition === null) return 0;
      if (a.avgDraftPosition === null) return 1;
      if (b.avgDraftPosition === null) return -1;
      return sign * (a.avgDraftPosition - b.avgDraftPosition);
    }
    return sign * (a.goals - b.goals) || b.mvpCount - a.mvpCount;
  });
  const recentFormRanks = computeRanks(recentFormRanked, (p) =>
    recentFormSort === "mvps"
      ? p.mvpCount
      : recentFormSort === "assists"
        ? p.assists
        : recentFormSort === "games"
          ? p.gamesPlayed
          : recentFormSort === "draftpos"
            ? (p.avgDraftPosition ?? Infinity)
            : p.goals,
  );

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
            { id: "draft-position", label: "Draft Position", href: `/?tab=draft-position&year=${year}` },
            { id: "assists", label: "Assists", href: `/?tab=assists&year=${year}` },
            { id: "recent-form", label: "Recent Form", href: `/?tab=recent-form&year=${year}` },
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
                  <SortableHeader
                    label="GP"
                    href={sortHref(tab, year, "games", plusMinusSort, dir)}
                    isActive={plusMinusSort === "games"}
                    dir={dir}
                  />
                  <SortableHeader
                    label="W-D-L"
                    href={sortHref(tab, year, "wins", plusMinusSort, dir)}
                    isActive={plusMinusSort === "wins"}
                    dir={dir}
                  />
                  <SortableHeader
                    label="+/-"
                    href={sortHref(tab, year, "plusminus", plusMinusSort, dir)}
                    isActive={plusMinusSort === "plusminus"}
                    dir={dir}
                  />
                </tr>
              </thead>
              <tbody>
                {plusMinusRanked.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{plusMinusRanks[i]}</td>
                    <td>
                      <a href={`/players/${p.canonicalId}`} className="leaderboard-name">
                        {p.displayName}
                      </a>
                      {year === ALL_YEARS_ID && (
                        <LeagueTitleChip years={awardTally.get(p.canonicalId)?.leagueTitleYears ?? []} />
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
                  <SortableHeader
                    label="Goals"
                    href={sortHref(tab, year, "goals", goldenBootSort, dir)}
                    isActive={goldenBootSort === "goals"}
                    dir={dir}
                  />
                  <SortableHeader
                    label="Per game"
                    href={sortHref(tab, year, "rate", goldenBootSort, dir)}
                    isActive={goldenBootSort === "rate"}
                    dir={dir}
                  />
                </tr>
              </thead>
              <tbody>
                {goldenBoot.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{goldenBootRanks[i]}</td>
                    <td>
                      <a href={`/players/${p.canonicalId}`} className="leaderboard-name">
                        {p.displayName}
                      </a>
                      {year === ALL_YEARS_ID && (
                        <GoldenBootChip years={awardTally.get(p.canonicalId)?.goldenBootYears ?? []} />
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

      {tab === "mvp" && (
        <p className="note">
          * MVP isn&rsquo;t officially tracked during games — these are a best estimate from
          the match reports, not a verified stat.
        </p>
      )}

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
                  <SortableHeader
                    label="MVP"
                    href={sortHref(tab, year, "mvp", mvpSort, dir)}
                    isActive
                    dir={dir}
                  />
                </tr>
              </thead>
              <tbody>
                {mvpRanked.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{mvpRanks[i]}</td>
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
                    href={sortHref(tab, year, "draftposition", draftPositionSort, dir)}
                    isActive
                    dir={dir}
                  />
                </tr>
              </thead>
              <tbody>
                {draftPositionRanked.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{draftPositionRanks[i]}</td>
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

      {tab === "assists" && (
        <p className="note">
          * Assists aren&rsquo;t officially tracked during games — these are a best estimate
          from the match reports, not a verified stat.
        </p>
      )}

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
                    href={sortHref(tab, year, "assists", assistsSort, dir)}
                    isActive
                    dir={dir}
                  />
                </tr>
              </thead>
              <tbody>
                {assistsRanked.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{assistsRanks[i]}</td>
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

      {tab === "recent-form" && (
        <p className="note">
          * Each player&rsquo;s own last {RECENT_FORM_WINDOW} games played — not the
          league&rsquo;s last {RECENT_FORM_WINDOW} games. MVP counts here carry the same
          best-estimate caveat as the MVP tab.
        </p>
      )}

      {tab === "recent-form" &&
        (recentFormRanked.length === 0 ? (
          <div className="empty-state">
            No recent-form data yet — this only ever comes from imported match reports,
            never the season spreadsheets.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <SortableHeader
                    label="Games"
                    href={sortHref(tab, year, "games", recentFormSort, dir)}
                    isActive={recentFormSort === "games"}
                    dir={dir}
                  />
                  <SortableHeader
                    label="Goals"
                    href={sortHref(tab, year, "goals", recentFormSort, dir)}
                    isActive={recentFormSort === "goals"}
                    dir={dir}
                  />
                  <SortableHeader
                    label="Assists"
                    href={sortHref(tab, year, "assists", recentFormSort, dir)}
                    isActive={recentFormSort === "assists"}
                    dir={dir}
                  />
                  <SortableHeader
                    label="MVPs"
                    href={sortHref(tab, year, "mvps", recentFormSort, dir)}
                    isActive={recentFormSort === "mvps"}
                    dir={dir}
                  />
                  <SortableHeader
                    label="Avg Draft Pos"
                    href={sortHref(tab, year, "draftpos", recentFormSort, dir, true)}
                    isActive={recentFormSort === "draftpos"}
                    dir={dir}
                  />
                </tr>
              </thead>
              <tbody>
                {recentFormRanked.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{recentFormRanks[i]}</td>
                    <td>
                      <a href={`/players/${p.canonicalId}`} className="leaderboard-name">
                        {p.displayName}
                      </a>
                    </td>
                    <td className="num">{p.gamesPlayed}</td>
                    <td className="num">{p.goals}</td>
                    <td className="num">{p.assists}</td>
                    <td className="num">{p.mvpCount}</td>
                    <td className="num">{p.avgDraftPosition === null ? "—" : p.avgDraftPosition.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </main>
  );
}
