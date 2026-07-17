const TICK_STROKE_WIDTH = 5;
// Fraction-of-capacity thresholds for the speedometer-style color zones —
// same green/yellow/red as this app's other status colors (see globals.css).
// Fixed by tick position (like a real tachometer's colored zones), not by
// how many are filled — filling in more ticks just reveals further into
// the gradient, the same way a needle moving right reveals the redline.
const YELLOW_ZONE_START = 0.6;
const RED_ZONE_START = 0.85;

function tickColor(positionFraction: number): string {
  if (positionFraction >= RED_ZONE_START) return "var(--status-critical-bg)";
  if (positionFraction >= YELLOW_ZONE_START) return "var(--status-warning-bg)";
  return "var(--status-good-bg)";
}

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
      <div className="capacity-gauge">
        <svg
          className="capacity-gauge-svg"
          viewBox="0 0 200 110"
          role="img"
          aria-label={`${checkedIn} of ${capacity} checked in, ${spotsLeft} spots left`}
        >
          {Array.from({ length: capacity }, (_, i) => {
            const positionFraction = capacity > 1 ? i / (capacity - 1) : 0;
            const angle = -90 + positionFraction * 180;
            return (
              <line
                key={i}
                x1="100"
                y1="13"
                x2="100"
                y2="27"
                transform={`rotate(${angle} 100 100)`}
                stroke={i < checkedIn ? tickColor(positionFraction) : "var(--border)"}
                strokeWidth={TICK_STROKE_WIDTH}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        <div className="capacity-gauge-center">
          <span className="capacity-gauge-count">
            {checkedIn} / {capacity}
          </span>
          <span className="capacity-gauge-spots-left">{spotsLeft} spots left</span>
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
