export function ScheduledGameStatusLine({
  kickoffLabel,
  venue,
}: {
  kickoffLabel: string;
  venue: string;
}) {
  return (
    <div className="matchday-status-line">
      <span className="status-dot" aria-hidden="true" />
      <span>SCHEDULED</span>
      <span aria-hidden="true">·</span>
      <span>{kickoffLabel}</span>
      <span aria-hidden="true">·</span>
      <span>{venue}</span>
    </div>
  );
}
