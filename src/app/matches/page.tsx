import { getCurrentUser } from "@/lib/auth/session";
import { listGameRecords, listPlayers } from "@/lib/stats-engine/data";
import { rosterDisplayName } from "@/lib/stats-engine/identity";
import { MatchCard } from "../_components/MatchCard";
import { PillTabs } from "../_components/PillTabs";
import { ScrollRestoration } from "../_components/ScrollRestoration";

// The real seasons this league has spreadsheets/reports for. Only the
// current season has per-game GameRecord data today — older years only ever
// produced season-total spreadsheets, never one row per match (see
// docs/data-contract.md). Real per-game history for those years can only
// come from backfilling Vadim's old report emails through the report
// parser, which hasn't happened yet.
const DEFAULT_YEAR = "2026";
const YEARS = [DEFAULT_YEAR, "2025", "2024", "2023", "2022"];

function isYear(value: string | undefined): value is string {
  return value !== undefined && YEARS.includes(value);
}

function mvpNameFor(
  mvpCanonicalId: string | null,
  playerById: Map<string, { displayName: string; rosterName?: string | null }>,
): string | undefined {
  if (!mvpCanonicalId) return undefined;
  const mvp = playerById.get(mvpCanonicalId);
  return mvp ? rosterDisplayName(mvp) : undefined;
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: rawYear } = await searchParams;
  const year = isYear(rawYear) ? rawYear : DEFAULT_YEAR;

  const [players, games] = await Promise.all([listPlayers(), listGameRecords()]);
  const user = await getCurrentUser();
  const playerById = new Map(players.map((p) => [p.canonicalId, p]));
  const sorted = games
    .filter((g) => g.date.startsWith(year))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main>
      <ScrollRestoration />
      <header className="screen-header-row">
        {user?.isAdmin && (
          <a href="/matches/import" className="rulebook-link" data-tour-id="import-report-link">
            + Import match report
          </a>
        )}
      </header>

      <PillTabs
        activeId={year}
        tabs={YEARS.map((y) => ({ id: y, label: y, href: `/matches?year=${y}` }))}
      />

      {sorted.length === 0 ? (
        <div className="empty-state">
          {year === DEFAULT_YEAR
            ? "No matches recorded in this dataset yet."
            : `No per-game match history has been backfilled for ${year} yet — those seasons only have
              season-total spreadsheets so far. Real per-game data for this year would need to come
              from parsing Vadim's old report emails for ${year} through the report parser.`}
        </div>
      ) : (
        <div className="match-card-list">
          {sorted.map((game) => (
            <MatchCard
              key={game.gameId}
              gameId={game.gameId}
              date={game.date}
              homeScore={game.homeScore}
              awayScore={game.awayScore}
              description={game.description}
              mvpName={mvpNameFor(game.mvpCanonicalId, playerById)}
              mvpHref={
                game.mvpCanonicalId
                  ? `/players/${game.mvpCanonicalId}?year=${year}#game-${game.gameId}`
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </main>
  );
}
