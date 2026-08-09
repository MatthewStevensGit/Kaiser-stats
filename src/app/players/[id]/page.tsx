import { notFound } from "next/navigation";
import { aggregateStandings, filterSeasonStandingRowsByYear } from "@/lib/stats-engine/aggregate";
import { listGameRecords, listPlayers, listSeasonStandingRows, listSeasonStatsCutoffs } from "@/lib/stats-engine/data";
import { mergePlayerSeasonStats, rollupGameRecords, selectStatsEligibleGames } from "@/lib/stats-engine/game-records";
import { formatPlusMinus, formatWDL } from "@/lib/format";
import { rosterDisplayName } from "@/lib/stats-engine/identity";
import { getPlayerGameLog } from "@/lib/stats-engine/player-game-log";
import { BackLink } from "../../_components/BackLink";
import { PlayerMatchRow } from "../../_components/PlayerMatchRow";
import { ScrollRestoration } from "../../_components/ScrollRestoration";
import { TabSelect } from "../../_components/TabSelect";

// Same real seasons as the Table/Past Matches pages' YEARS lists — "all" is
// an extra option (not a real year) showing this player's entire history,
// which will keep growing as more historical reports get backfilled (500ish
// games expected eventually, not just the current handful).
const ALL_YEARS_ID = "all";
const YEARS = ["2026", "2025", "2024", "2023", "2022", ALL_YEARS_ID];
const DEFAULT_YEAR = "2026";

function isYear(value: string | undefined): value is string {
  return value !== undefined && YEARS.includes(value);
}

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { id } = await params;
  const { year: rawYear } = await searchParams;
  const year = isYear(rawYear) ? rawYear : DEFAULT_YEAR;

  const [players, allRows, games, cutoffs] = await Promise.all([
    listPlayers(),
    listSeasonStandingRows(),
    listGameRecords(),
    listSeasonStatsCutoffs(),
  ]);

  const player = players.find((p) => p.canonicalId === id);
  if (!player) notFound();

  const rows = filterSeasonStandingRowsByYear(allRows, year);
  const { players: spreadsheetTotals } = aggregateStandings(rows, players, "merged");
  const eligibleGames = selectStatsEligibleGames(games, cutoffs, year);
  const reportTotals = rollupGameRecords(eligibleGames, players);
  const totals = mergePlayerSeasonStats(spreadsheetTotals, reportTotals);
  const stats = totals.find((p) => p.canonicalId === id);
  const summary = stats
    ? `${formatWDL(stats.wins, stats.ties, stats.losses)} · ${formatPlusMinus(stats.plusMinus)} · ${stats.goals} GOALS`
    : "0-0-0 · 0 · 0 GOALS";

  const fullLog = getPlayerGameLog(id, games);
  const log = year === ALL_YEARS_ID ? fullLog : fullLog.filter((entry) => entry.date.startsWith(year));

  // The totals above come from aggregateStandings/mergePlayerSeasonStats: for
  // any year with no season_stats_cutoff row, that merge is 100% spreadsheet
  // (see selectStatsEligibleGames's doc comment) — the per-game log below is
  // unconditional on cutoffs, so for those years it's a genuinely separate
  // view of the same season, not a subset that should sum to the totals above.
  const yearsShown = year === ALL_YEARS_ID ? YEARS.filter((y) => y !== ALL_YEARS_ID).map(Number) : [Number(year)];
  const hasSpreadsheetOnlyYear = yearsShown.some((y) => !cutoffs.has(y));

  return (
    <main>
      <ScrollRestoration />
      <BackLink fallbackHref="/" />
      <header className="player-header">
        <h1 className="screen-header screen-header-name-case">{rosterDisplayName(player)}</h1>
        <p className="player-summary-line">{summary}</p>
      </header>

      <div className="tab-select-row">
        <TabSelect
          value={year}
          ariaLabel="Year"
          options={YEARS.map((y) => ({
            id: y,
            label: y === ALL_YEARS_ID ? "All Years" : y,
            href: `/players/${id}?year=${y}`,
          }))}
        />
      </div>

      {hasSpreadsheetOnlyYear && log.length > 0 && (
        <p className="note">
          * The totals above come from the official season spreadsheet for any year without
          live per-game tracking yet. The games below are individually tracked from email
          reports and are shown for reference — they aren&rsquo;t added into the totals above,
          since the spreadsheet already covers those seasons in full.
        </p>
      )}

      {log.length === 0 ? (
        <div className="empty-state">
          {year === ALL_YEARS_ID ? "No games logged yet." : `No games logged yet for ${year}.`}
        </div>
      ) : (
        <div className="player-match-row-list">
          {log.map((entry) => (
            <a
              key={entry.gameId}
              id={`game-${entry.gameId}`}
              href={`/matches/${entry.gameId}`}
              className="match-card-link"
            >
              <PlayerMatchRow entry={entry} />
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
