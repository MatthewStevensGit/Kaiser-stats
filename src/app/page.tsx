import { aggregateStandings, filterSeasonStandingRowsByYear, rankByRate } from "@/lib/stats-engine/aggregate";
import { listGameRecords, listPlayers, listSeasonStandingRows, listSeasonStatsCutoffs } from "@/lib/stats-engine/data";
import { mergePlayerSeasonStats, rollupGameRecords, selectStatsEligibleGames } from "@/lib/stats-engine/game-records";
import { formatPlusMinus, formatWDL } from "@/lib/format";
import { PillTabs } from "./_components/PillTabs";

const GOLDEN_BOOT_MIN_GAMES = 3;

type TableTab = "plus-minus" | "golden-boot";

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
  return value === "plus-minus" || value === "golden-boot";
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

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Table</h1>
        <a href="/rules" className="rulebook-link">
          📖 Rulebook
        </a>
      </header>

      <PillTabs
        activeId={tab}
        tabs={[
          { id: "plus-minus", label: "Plus-Minus", href: `/?tab=plus-minus&year=${year}` },
          { id: "golden-boot", label: "Golden Boot", href: `/?tab=golden-boot&year=${year}` },
        ]}
      />

      <PillTabs
        activeId={year}
        tabs={YEARS.map((y) => ({
          id: y,
          label: y === ALL_YEARS_ID ? "All Years" : y,
          href: `/?tab=${tab}&year=${y}`,
        }))}
      />

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
                        {p.displayName.toUpperCase()}
                      </a>
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
                        {p.displayName.toUpperCase()}
                      </a>
                    </td>
                    <td className="num">{p.goals}</td>
                    <td className="num">{p.rate.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </main>
  );
}
