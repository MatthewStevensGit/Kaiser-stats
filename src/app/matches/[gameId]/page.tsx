import { notFound } from "next/navigation";
import { formatMatchDateLabel, formatScoreLine, getMultiGoalNickname } from "@/lib/format";
import { loadSampleData } from "@/lib/sample-data";
import { summarizeGoalsByScorer } from "@/lib/stats-engine/goal-summary";
import { GoalChip } from "../../_components/GoalChip";
import { MvpBadge } from "../../_components/MvpBadge";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const { players, games } = loadSampleData();

  const game = games.find((g) => g.gameId === gameId);
  if (!game) notFound();

  const nameFor = (canonicalId: string) =>
    players.find((p) => p.canonicalId === canonicalId)?.displayName ?? canonicalId;
  const mvpName = game.mvpCanonicalId ? nameFor(game.mvpCanonicalId) : undefined;
  const scorers = summarizeGoalsByScorer(game.goals);

  return (
    <main>
      <a href="/matches" className="back-link">
        ← Back to past matches
      </a>
      <header className="player-header">
        <h1 className="screen-header">{formatMatchDateLabel(game.date)}</h1>
        <p className="player-summary-line">{formatScoreLine(game.homeScore, game.awayScore)}</p>
      </header>

      {mvpName && <MvpBadge name={mvpName} />}

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

      {scorers.length > 0 && (
        <section className="card match-detail-section">
          <h2>Goals</h2>
          <ul className="match-detail-goal-list">
            {scorers.map((scorer) => {
              const nickname = getMultiGoalNickname(scorer.goals);
              return (
                <li key={scorer.scorerCanonicalId} className={`match-detail-goal-${scorer.team}`}>
                  <a href={`/players/${scorer.scorerCanonicalId}`} className="match-detail-scorer-name">
                    {nameFor(scorer.scorerCanonicalId)}
                  </a>
                  <GoalChip count={scorer.goals} />
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
