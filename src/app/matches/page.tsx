import { getCurrentUser } from "@/lib/auth/session";
import { loadSampleData } from "@/lib/sample-data";
import { MatchCard } from "../_components/MatchCard";
import { PillTabs } from "../_components/PillTabs";

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

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: rawYear } = await searchParams;
  const year = isYear(rawYear) ? rawYear : DEFAULT_YEAR;

  const { players, games } = loadSampleData();
  const user = await getCurrentUser();
  const sorted = games
    .filter((g) => g.date.startsWith(year))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Past Matches</h1>
        {user?.isAdmin && (
          <a href="/matches/import" className="rulebook-link">
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
            <a key={game.gameId} href={`/matches/${game.gameId}`} className="match-card-link">
              <MatchCard
                date={game.date}
                homeScore={game.homeScore}
                awayScore={game.awayScore}
                description={game.description}
                mvpName={
                  game.mvpCanonicalId
                    ? players.find((p) => p.canonicalId === game.mvpCanonicalId)?.displayName
                    : undefined
                }
              />
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
