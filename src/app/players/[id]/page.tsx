import { notFound } from "next/navigation";
import { aggregateStandings, filterSeasonStandingRowsByYear } from "@/lib/stats-engine/aggregate";
import { listGameRecords, listPlayers, listSeasonStandingRows, listSeasonStatsCutoffs } from "@/lib/stats-engine/data";
import { mergePlayerSeasonStats, rollupGameRecords, selectStatsEligibleGames } from "@/lib/stats-engine/game-records";
import { formatPlusMinus, formatWDL } from "@/lib/format";
import { getPlayerGameLog } from "@/lib/stats-engine/player-game-log";
import { PlayerMatchRow } from "../../_components/PlayerMatchRow";

// Same current season as the Table page's default year — the header summary
// shows this year's record, not an all-time career total (the per-game log
// below still lists every game regardless of year).
const CURRENT_YEAR = "2026";

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [players, allRows, games, cutoffs] = await Promise.all([
    listPlayers(),
    listSeasonStandingRows(),
    listGameRecords(),
    listSeasonStatsCutoffs(),
  ]);

  const player = players.find((p) => p.canonicalId === id);
  if (!player) notFound();

  const rows = filterSeasonStandingRowsByYear(allRows, CURRENT_YEAR);
  const { players: spreadsheetTotals } = aggregateStandings(rows, players, "merged");
  const eligibleGames = selectStatsEligibleGames(games, cutoffs, CURRENT_YEAR);
  const reportTotals = rollupGameRecords(eligibleGames, players);
  const totals = mergePlayerSeasonStats(spreadsheetTotals, reportTotals);
  const stats = totals.find((p) => p.canonicalId === id);
  const summary = stats
    ? `${formatWDL(stats.wins, stats.ties, stats.losses)} · ${formatPlusMinus(stats.plusMinus)} · ${stats.goals} GOALS`
    : "0-0-0 · 0 · 0 GOALS";

  const log = getPlayerGameLog(id, games);

  return (
    <main>
      <a href="/" className="back-link">
        ← Back to stats
      </a>
      <header className="player-header">
        <h1 className="screen-header screen-header-name-case">{player.displayName}</h1>
        <p className="player-summary-line">{summary}</p>
      </header>

      {log.length === 0 ? (
        <div className="empty-state">No games logged yet.</div>
      ) : (
        <div className="player-match-row-list">
          {log.map((entry) => (
            <a key={entry.gameId} href={`/matches/${entry.gameId}`} className="match-card-link">
              <PlayerMatchRow entry={entry} />
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
