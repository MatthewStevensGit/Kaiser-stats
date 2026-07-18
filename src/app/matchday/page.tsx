import { getCurrentUser } from "@/lib/auth/session";
import { LEAGUE_CAPACITY_BY_LEAGUE } from "@/lib/matchday/constants";
import { listScheduledGames } from "@/lib/matchday/data";
import { computeMatchdayStatusTier } from "@/lib/matchday/registration-window";
import { listPlayers } from "@/lib/stats-engine/data";
import { CancelGameButton } from "../_components/CancelGameButton";
import { CheckedInNamesToggle } from "../_components/CheckedInNamesToggle";
import { ScheduledGameCard } from "../_components/ScheduledGameCard";

// Real Supabase-backed data now (see src/lib/matchday/data.ts) — must not be
// cached/prerendered at build time.
export const dynamic = "force-dynamic";

export default async function MatchdayPage() {
  const [scheduledGames, user, players] = await Promise.all([
    listScheduledGames(),
    getCurrentUser(),
    listPlayers(),
  ]);
  const sorted = [...scheduledGames].sort((a, b) => a.date.localeCompare(b.date));
  const nameById = new Map(players.map((p) => [p.canonicalId, p.displayName]));
  const now = new Date();

  return (
    <main>
      <header className="screen-header-row">
        <div className="matchday-header-links">
          {user?.isAdmin && (
            <a href="/matchday/new" className="rulebook-link">
              + Add Game
            </a>
          )}
        </div>
      </header>

      {sorted.length === 0 ? (
        <div className="empty-state">No games scheduled yet.</div>
      ) : (
        <div className="match-card-list">
          {sorted.map((game) => {
            const capacity = LEAGUE_CAPACITY_BY_LEAGUE[game.league];
            const checkedInCount = game.checkedInCanonicalIds.length;
            const tier = computeMatchdayStatusTier(now, game.date, game.league, checkedInCount, capacity);
            const checkedInNames = game.checkedInCanonicalIds.map((id) => nameById.get(id) ?? id);

            return (
              <div key={game.gameId} className="matchday-card-wrapper">
                <a href={`/matchday/${game.gameId}`} className="match-card-link">
                  <ScheduledGameCard game={game} tier={tier} />
                </a>
                {!game.cancelled && (
                  <CheckedInNamesToggle
                    className="checkedin-toggle checkedin-toggle-corner"
                    triggerLabel={`${checkedInCount}/${capacity}`}
                    triggerAriaLabel={`${checkedInCount} of ${capacity} checked in — click to see who`}
                    names={checkedInNames}
                  />
                )}
                {user?.isAdmin && <CancelGameButton gameId={game.gameId} date={game.date} />}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
