import { loadSampleData } from "@/lib/sample-data";
import { ScheduledGameCard } from "../_components/ScheduledGameCard";

export default function MatchdayPage() {
  const { scheduledGames } = loadSampleData();
  const sorted = [...scheduledGames].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Matchday</h1>
        <a href="/matches" className="rulebook-link">
          Past Matches
        </a>
      </header>

      {sorted.length === 0 ? (
        <div className="empty-state">No games scheduled yet.</div>
      ) : (
        <div className="match-card-list">
          {sorted.map((game) => (
            <a key={game.gameId} href={`/matchday/${game.gameId}`} className="match-card-link">
              <ScheduledGameCard game={game} />
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
