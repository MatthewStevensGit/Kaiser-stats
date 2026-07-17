import { getCurrentUser } from "@/lib/auth/session";
import { listScheduledGames } from "@/lib/matchday/data";
import { CancelGameButton } from "../_components/CancelGameButton";
import { ScheduledGameCard } from "../_components/ScheduledGameCard";

// Real Supabase-backed data now (see src/lib/matchday/data.ts) — must not be
// cached/prerendered at build time.
export const dynamic = "force-dynamic";

export default async function MatchdayPage() {
  const [scheduledGames, user] = await Promise.all([listScheduledGames(), getCurrentUser()]);
  const sorted = [...scheduledGames].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main>
      <header className="screen-header-row">
        <div className="matchday-header-links">
          {user?.isAdmin && (
            <a href="/matchday/new" className="rulebook-link">
              + Add Game
            </a>
          )}
          <a href="/matches" className="rulebook-link">
            Past Matches
          </a>
        </div>
      </header>

      {sorted.length === 0 ? (
        <div className="empty-state">No games scheduled yet.</div>
      ) : (
        <div className="match-card-list">
          {sorted.map((game) => (
            <div key={game.gameId} className="matchday-card-wrapper">
              <a href={`/matchday/${game.gameId}`} className="match-card-link">
                <ScheduledGameCard game={game} />
              </a>
              {user?.isAdmin && <CancelGameButton gameId={game.gameId} date={game.date} />}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
