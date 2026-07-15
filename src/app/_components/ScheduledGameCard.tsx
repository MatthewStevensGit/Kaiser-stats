import { formatMatchDateLabel } from "@/lib/format";
import type { ScheduledGame } from "@/lib/matchday/types";
import { ScheduledGameStatusLine } from "./ScheduledGameStatusLine";

export function ScheduledGameCard({ game }: { game: ScheduledGame }) {
  return (
    <div className="match-card">
      <span className="match-card-date">{formatMatchDateLabel(game.date)}</span>
      <ScheduledGameStatusLine kickoffLabel={game.kickoffLabel} venue={game.venue} />
    </div>
  );
}
