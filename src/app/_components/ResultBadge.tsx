const LABEL: Record<"win" | "draw" | "loss", string> = { win: "W", draw: "D", loss: "L" };

export function ResultBadge({ result }: { result: "win" | "draw" | "loss" }) {
  return (
    <span className={`result-badge result-badge-${result}`} aria-label={result}>
      {LABEL[result]}
    </span>
  );
}
