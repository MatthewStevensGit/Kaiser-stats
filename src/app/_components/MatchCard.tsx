import { formatMatchDateLabel, formatScoreLine, truncate } from "@/lib/format";
import { MvpBadge } from "./MvpBadge";

const DESCRIPTION_TRUNCATE_LENGTH = 140;

export function MatchCard({
  date,
  homeScore,
  awayScore,
  description,
  mvpName,
}: {
  date: string;
  homeScore: number;
  awayScore: number;
  description?: string;
  mvpName?: string;
}) {
  return (
    <div className="match-card">
      <div className="match-card-top">
        <span className="match-card-date">{formatMatchDateLabel(date)}</span>
        <span className="match-card-score">{formatScoreLine(homeScore, awayScore)}</span>
      </div>
      {mvpName && <MvpBadge name={mvpName} />}
      {description && (
        <p className="match-card-desc">{truncate(description, DESCRIPTION_TRUNCATE_LENGTH)}</p>
      )}
    </div>
  );
}
