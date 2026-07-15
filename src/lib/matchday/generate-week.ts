import { addDaysToIsoDate, getTodayIsoInEastern } from "./registration-window";
import type { ScheduledLeague } from "./types";

function dayOfWeek(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay(); // 0 = Sunday
}

/**
 * Anchors to "the most recent Sunday on/before today's ET calendar date"
 * rather than assuming the cron always fires exactly on a Sunday — robust
 * to a late/manual trigger (e.g. a redeploy catch-up run on a Tuesday still
 * generates the same upcoming week's games, not the week after).
 */
export function computeNextWeekGameDates(
  nowUtc: Date,
): { date: string; league: ScheduledLeague }[] {
  const todayIso = getTodayIsoInEastern(nowUtc);
  const anchorIso = addDaysToIsoDate(todayIso, -dayOfWeek(todayIso));

  return [
    { date: addDaysToIsoDate(anchorIso, 6), league: "saturday" },
    { date: addDaysToIsoDate(anchorIso, 7), league: "sunday" },
  ];
}
