import { listScheduledGames } from "@/lib/matchday/data";
import { ScheduledGameCard } from "../_components/ScheduledGameCard";

// Real Supabase-backed data now (see src/lib/matchday/data.ts) — must not be
// cached/prerendered at build time.
export const dynamic = "force-dynamic";

export default async function MatchdayPage() {
  const scheduledGames = await listScheduledGames();
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
