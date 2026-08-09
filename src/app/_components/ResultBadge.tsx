const LABEL: Record<"win" | "draw" | "loss", string> = { win: "W", draw: "D", loss: "L" };

/** result is null for a "no report" game — a real roster, no score ever emailed (see GameRecord.homeScore's doc comment). */
export function ResultBadge({ result }: { result: "win" | "draw" | "loss" | null }) {
  if (result === null) {
    return (
      <span className="result-badge result-badge-none" aria-label="no report">
        –
      </span>
    );
  }
  return (
    <span className={`result-badge result-badge-${result}`} aria-label={result}>
      {LABEL[result]}
    </span>
  );
}
