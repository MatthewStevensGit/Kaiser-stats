import { formatMatchDateLabel } from "@/lib/format";
import type { MatchdayStatusTier } from "@/lib/matchday/registration-window";
import type { ScheduledGame } from "@/lib/matchday/types";
import { ScheduledGameStatusLine } from "./ScheduledGameStatusLine";

export function ScheduledGameCard({ game, tier }: { game: ScheduledGame; tier: MatchdayStatusTier }) {
  return (
    <div className="match-card">
      <span className="match-card-date">{formatMatchDateLabel(game.date)}</span>
      <ScheduledGameStatusLine tier={tier} kickoffLabel={game.kickoffLabel} venue={game.venue} />
    </div>
  );
}
