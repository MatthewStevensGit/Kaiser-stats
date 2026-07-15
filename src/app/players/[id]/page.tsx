import { notFound } from "next/navigation";
import { aggregateStandings } from "@/lib/stats-engine/aggregate";
import { formatWDL } from "@/lib/format";
import { getPlayerGameLog } from "@/lib/stats-engine/player-game-log";
import { loadSampleData } from "@/lib/sample-data";
import { PlayerMatchRow } from "../../_components/PlayerMatchRow";

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { players, rows, games } = loadSampleData();

  const player = players.find((p) => p.canonicalId === id);
  if (!player) notFound();

  const { players: totals } = aggregateStandings(rows, players, "merged");
  const stats = totals.find((p) => p.canonicalId === id);
  const summary = stats
    ? `${formatWDL(stats.wins, stats.ties, stats.losses)} · ${stats.goals} GOALS`
    : "0-0-0 · 0 GOALS";

  const log = getPlayerGameLog(id, games);

  return (
    <main>
      <a href="/" className="back-link">
        ← Back to table
      </a>
      <header className="player-header">
        <h1 className="screen-header">{player.displayName.toUpperCase()}</h1>
        <p className="player-summary-line">{summary}</p>
      </header>

      {log.length === 0 ? (
        <div className="empty-state">No games logged yet.</div>
      ) : (
        <div className="player-match-row-list">
          {log.map((entry) => (
            <PlayerMatchRow key={entry.gameId} entry={entry} />
          ))}
        </div>
      )}
    </main>
  );
}
