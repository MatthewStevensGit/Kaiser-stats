import { notFound } from "next/navigation";
import { formatMatchDateLabel, formatScoreLine, getMultiGoalNickname } from "@/lib/format";
import { listGameRecords, listPlayers } from "@/lib/stats-engine/data";
import { summarizePlayerGameStats } from "@/lib/stats-engine/goal-summary";
import { AssistChip } from "../../_components/AssistChip";
import { BackLink } from "../../_components/BackLink";
import { GoalChip } from "../../_components/GoalChip";
import { MvpBadge } from "../../_components/MvpBadge";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const [players, games] = await Promise.all([listPlayers(), listGameRecords()]);

  const game = games.find((g) => g.gameId === gameId);
  if (!game) notFound();

  const nameFor = (canonicalId: string) =>
    players.find((p) => p.canonicalId === canonicalId)?.displayName ?? canonicalId;
  const mvpName = game.mvpCanonicalId ? nameFor(game.mvpCanonicalId) : undefined;
  const stats = summarizePlayerGameStats(game.goals);

  return (
    <main>
      <BackLink fallbackHref="/matches" />
      <header className="player-header">
        <h1 className="screen-header">{formatMatchDateLabel(game.date)}</h1>
        <p className="player-summary-line">{formatScoreLine(game.homeScore, game.awayScore)}</p>
      </header>

      {mvpName && game.mvpCanonicalId && (
        <a
          href={`/players/${game.mvpCanonicalId}?year=${game.date.slice(0, 4)}#game-${game.gameId}`}
          className="match-card-mvp-link"
        >
          <MvpBadge name={mvpName} />
        </a>
      )}

      <section className="card match-detail-section">
        <h2>Report</h2>
        {game.description ? (
          <p className="match-detail-report">{game.description}</p>
        ) : (
          <div className="empty-state">
            No report has been pasted in for this match yet. Once admin editing ships, this is
            where Vadim&apos;s report gets pasted in for a match.
          </div>
        )}
      </section>

      {stats.length > 0 && (
        <section className="card match-detail-section">
          <h2>Stats</h2>
          <ul className="match-detail-goal-list">
            {stats.map((stat) => {
              const nickname = getMultiGoalNickname(stat.goals);
              return (
                <li key={stat.canonicalId} className={`match-detail-goal-${stat.team}`}>
                  <a
                    href={`/players/${stat.canonicalId}`}
                    className={`match-detail-scorer-name match-detail-scorer-name-${stat.team}`}
                  >
                    {nameFor(stat.canonicalId)}
                  </a>
                  <GoalChip count={stat.goals} />
                  <AssistChip count={stat.assists} />
                  {nickname && <span className="match-detail-goal-nickname">{nickname}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
