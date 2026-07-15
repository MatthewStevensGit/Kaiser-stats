import { REGISTRATION_CUTOFF_BY_LEAGUE } from "./constants";
import type { ScheduledLeague } from "./types";

const EASTERN_TIME_ZONE = "America/New_York";

interface DateParts {
  year: number;
  month: number; // 1-indexed
  day: number;
}

function parseIsoDateParts(iso: string): DateParts {
  const [yearStr, monthStr, dayStr] = iso.split("-");
  if (yearStr === undefined || monthStr === undefined || dayStr === undefined) {
    throw new Error(`Not a valid ISO date-only string: "${iso}"`);
  }
  return { year: Number(yearStr), month: Number(monthStr), day: Number(dayStr) };
}

/**
 * Pure calendar-day arithmetic on a date-only ISO string (e.g. "2026-07-18"),
 * treating it as UTC-anchored — same convention as format.ts's
 * formatMatchDateLabel. Returns a new "YYYY-MM-DD" string.
 */
export function addDaysToIsoDate(iso: string, days: number): string {
  const { year, month, day } = parseIsoDateParts(iso);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The IANA zone's UTC offset, in minutes, at a given instant — negative for
 * zones west of UTC (e.g. -240 for EDT, -300 for EST). Uses Intl rather than
 * a fixed offset so DST transitions resolve correctly without a dependency.
 */
function getTimeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(instant);
  const offsetPart = parts.find((p) => p.type === "timeZoneName");
  if (!offsetPart) {
    throw new Error(`Could not determine UTC offset for time zone "${timeZone}"`);
  }
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(offsetPart.value);
  if (!match) {
    throw new Error(`Unrecognized offset format "${offsetPart.value}" for time zone "${timeZone}"`);
  }
  const [, sign, hoursStr, minutesStr] = match;
  const hours = Number(hoursStr);
  const minutes = minutesStr ? Number(minutesStr) : 0;
  const magnitude = hours * 60 + minutes;
  return sign === "-" ? -magnitude : magnitude;
}

/**
 * Converts a "wall clock" date/time as read in `timeZone` into the actual
 * UTC instant it represents. Builds a guess UTC instant from the numbers
 * as-if they were UTC, looks up the zone's real offset at that guess, then
 * corrects once — exact here because every cutoff this app uses (5pm/3pm
 * ET) is many hours away from the 2am-local DST transition boundary, so a
 * single correction never lands on the wrong side of it.
 */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(guessUtcMs), timeZone);
  return new Date(guessUtcMs - offsetMinutes * 60_000);
}

/** The exact UTC instant registration closes for a scheduled game. */
export function getRegistrationCutoffUtc(gameDateIso: string, league: ScheduledLeague): Date {
  const cutoff = REGISTRATION_CUTOFF_BY_LEAGUE[league];
  const cutoffDateIso = addDaysToIsoDate(gameDateIso, cutoff.dayOffset);
  const { year, month, day } = parseIsoDateParts(cutoffDateIso);
  return zonedWallTimeToUtc(year, month, day, cutoff.hour, cutoff.minute, EASTERN_TIME_ZONE);
}

/** Whether registration is still open at `nowUtc` — closed at (not after) the exact cutoff instant. */
export function isRegistrationOpen(nowUtc: Date, gameDateIso: string, league: ScheduledLeague): boolean {
  return nowUtc.getTime() < getRegistrationCutoffUtc(gameDateIso, league).getTime();
}

/** Formats a cutoff instant back into Eastern wall time for display, e.g. "Fri, Jul 17, 5:00 PM ET". */
export function formatCutoffLabel(cutoffUtc: Date): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(cutoffUtc);
  return `${formatted} ET`;
}
