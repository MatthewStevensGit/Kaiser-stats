import { KICKOFF_LABEL_BY_LEAGUE, VENUE_BY_LEAGUE } from "@/lib/matchday/constants";
import type { ScheduledLeague } from "@/lib/matchday/types";

export function ScheduledGameStatusLine({ league }: { league: ScheduledLeague }) {
  return (
    <div className="matchday-status-line">
      <span className="status-dot" aria-hidden="true" />
      <span>SCHEDULED</span>
      <span aria-hidden="true">·</span>
      <span>{KICKOFF_LABEL_BY_LEAGUE[league]}</span>
      <span aria-hidden="true">·</span>
      <span>{VENUE_BY_LEAGUE[league]}</span>
    </div>
  );
}
