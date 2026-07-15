const TICK_COUNT_MAX_STROKE = 3;

export function CapacityRing({
  checkedIn,
  capacity,
  minimum,
}: {
  checkedIn: number;
  capacity: number;
  minimum: number;
}) {
  const spotsLeft = Math.max(capacity - checkedIn, 0);
  const stillNeeded = Math.max(minimum - checkedIn, 0);

  return (
    <div>
      <div className="capacity-ring">
        <svg className="capacity-ring-svg" viewBox="0 0 100 100" role="img" aria-label={`${checkedIn} of ${capacity} checked in, ${spotsLeft} spots left`}>
          {Array.from({ length: capacity }, (_, i) => (
            <line
              key={i}
              x1="50"
              y1="4"
              x2="50"
              y2="12"
              transform={`rotate(${i * (360 / capacity)} 50 50)`}
              stroke={i < checkedIn ? "var(--accent)" : "var(--border)"}
              strokeWidth={TICK_COUNT_MAX_STROKE}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className="capacity-ring-center">
          <span className="capacity-ring-count">
            {checkedIn} / {capacity}
          </span>
          <span className="capacity-ring-spots-left">{spotsLeft} spots left</span>
        </div>
      </div>
      {stillNeeded > 0 && (
        <p className="capacity-ring-minimum-note">
          Needs {stillNeeded} more to hit the {minimum} minimum.
        </p>
      )}
    </div>
  );
}
