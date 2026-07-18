import { formatMatchDateLabel, formatScoreLine } from "@/lib/format";
import type { PlayerGameLogEntry } from "@/lib/stats-engine/player-game-log";
import { AssistChip } from "./AssistChip";
import { GoalChip } from "./GoalChip";
import { MvpBadge } from "./MvpBadge";
import { ResultBadge } from "./ResultBadge";

export function PlayerMatchRow({ entry }: { entry: PlayerGameLogEntry }) {
  return (
    <div className="player-match-row">
      <div className="player-match-row-main">
        <ResultBadge result={entry.result} />
        <span className="player-match-row-date">{formatMatchDateLabel(entry.date)}</span>
        <span className="player-match-row-score">{formatScoreLine(entry.homeScore, entry.awayScore)}</span>
      </div>
      <div className="player-match-row-trailing">
        {entry.isMvp && <MvpBadge />}
        <GoalChip count={entry.goals} />
        <AssistChip count={entry.assists} />
      </div>
    </div>
  );
}
