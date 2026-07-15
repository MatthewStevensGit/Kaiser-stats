/**
 * "2026-07-12" -> "SUN JUL 12". Formats in UTC deliberately — new
 * Date(iso) parses a date-only ISO string as UTC midnight, and formatting
 * without timeZone: "UTC" would let the server/browser's local offset shift
 * the displayed date by a day.
 */
export function formatMatchDateLabel(iso: string): string {
  const date = new Date(iso);
  return date
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase()
    .replace(",", "");
}

export function formatScoreLine(homeScore: number, awayScore: number): string {
  return `${homeScore} – ${awayScore}`;
}

export function formatWDL(wins: number, ties: number, losses: number): string {
  return `${wins}-${ties}-${losses}`;
}

export function formatPlusMinus(plusMinus: number): string {
  return plusMinus > 0 ? `+${plusMinus}` : `${plusMinus}`;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

const MULTI_GOAL_NICKNAME_BY_COUNT: Record<number, string> = {
  2: "Brace",
  3: "Hat-trick",
  4: "Poker",
  5: "Glut",
  6: "Double Hat-trick",
};

/** A fun soccer term for a multi-goal game, or null if there isn't a named one for this count. */
export function getMultiGoalNickname(count: number): string | null {
  return MULTI_GOAL_NICKNAME_BY_COUNT[count] ?? null;
}
