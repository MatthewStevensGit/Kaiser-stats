import { GAME_START_BY_LEAGUE, REGISTRATION_CUTOFF_BY_LEAGUE, REGISTRATION_OPEN_BY_LEAGUE } from "./constants";
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

/**
 * The exact UTC instant registration opens for a scheduled game. Note: the
 * Saturday-league open time is midnight ET, only ~2 hours from the 2am-ET
 * DST transition instant — much closer than the close-time cutoffs' 13+
 * hour margin. Still exact: the relevant Friday is always the week *before*
 * a game, so it's never within days of the actual transition Sunday. See
 * the "near-boundary" test case in __tests__/registration-window.test.ts.
 */
export function getRegistrationOpenUtc(gameDateIso: string, league: ScheduledLeague): Date {
  const open = REGISTRATION_OPEN_BY_LEAGUE[league];
  const openDateIso = addDaysToIsoDate(gameDateIso, open.dayOffset);
  const { year, month, day } = parseIsoDateParts(openDateIso);
  return zonedWallTimeToUtc(year, month, day, open.hour, open.minute, EASTERN_TIME_ZONE);
}

/** The exact UTC instant a scheduled game kicks off (league default — see GAME_START_BY_LEAGUE). */
export function getGameStartUtc(gameDateIso: string, league: ScheduledLeague): Date {
  const start = GAME_START_BY_LEAGUE[league];
  const startDateIso = addDaysToIsoDate(gameDateIso, start.dayOffset);
  const { year, month, day } = parseIsoDateParts(startDateIso);
  return zonedWallTimeToUtc(year, month, day, start.hour, start.minute, EASTERN_TIME_ZONE);
}

const CHECKIN_EXPIRY_MINUTES_AFTER_KICKOFF = 60;

/**
 * One hour after kickoff — past this instant, a game's check-in list (that
 * morning's headcount) has served its purpose and should be cleared out (see
 * src/app/api/matchday/clear-expired-checkins/route.ts). Distinct from
 * registration closing (which happens well before kickoff, see
 * getRegistrationCutoffUtc) — this is about the check-in list outliving the
 * game itself, not about registration.
 */
export function getCheckinExpiryUtc(gameDateIso: string, league: ScheduledLeague): Date {
  return new Date(getGameStartUtc(gameDateIso, league).getTime() + CHECKIN_EXPIRY_MINUTES_AFTER_KICKOFF * 60_000);
}

export function getRegistrationWindowUtc(
  gameDateIso: string,
  league: ScheduledLeague,
): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: getRegistrationOpenUtc(gameDateIso, league),
    closesAt: getRegistrationCutoffUtc(gameDateIso, league),
  };
}

export type RegistrationStatus = "not-open" | "open" | "closed";

/** Half-open interval: not-open strictly before opensAt, open in [opensAt, closesAt), closed at/after closesAt. */
export function getRegistrationStatus(
  nowUtc: Date,
  gameDateIso: string,
  league: ScheduledLeague,
): RegistrationStatus {
  const { opensAt, closesAt } = getRegistrationWindowUtc(gameDateIso, league);
  const nowMs = nowUtc.getTime();
  if (nowMs < opensAt.getTime()) return "not-open";
  if (nowMs < closesAt.getTime()) return "open";
  return "closed";
}

/**
 * The 5 display states for a scheduled game's status dot/bar — a strict
 * refinement of RegistrationStatus that also accounts for capacity. "filled"
 * always wins regardless of time remaining (a game that fills up with hours
 * left in the window is done registering just as much as one that fills up
 * at the last second); otherwise it's the plain registration-window state,
 * with "open" further split into "closing-soon" once under an hour remains.
 */
export type MatchdayStatusTier = "scheduled" | "open" | "closing-soon" | "filled" | "closed";

const CLOSING_SOON_THRESHOLD_MS = 60 * 60 * 1000;

export function computeMatchdayStatusTier(
  nowUtc: Date,
  gameDateIso: string,
  league: ScheduledLeague,
  checkedInCount: number,
  capacity: number,
): MatchdayStatusTier {
  if (checkedInCount >= capacity) return "filled";
  const { opensAt, closesAt } = getRegistrationWindowUtc(gameDateIso, league);
  const nowMs = nowUtc.getTime();
  if (nowMs < opensAt.getTime()) return "scheduled";
  if (nowMs >= closesAt.getTime()) return "closed";
  if (closesAt.getTime() - nowMs < CLOSING_SOON_THRESHOLD_MS) return "closing-soon";
  return "open";
}

/** Formats a UTC instant back into Eastern wall time for display, e.g. "Fri, Jul 17, 5:00 PM ET". */
export function formatCutoffLabel(instantUtc: Date): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instantUtc);
  return `${formatted} ET`;
}

/** Today's calendar date in America/New_York, as "YYYY-MM-DD" — not new Date().toISOString(), which is UTC. */
export function getTodayIsoInEastern(nowUtc: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(nowUtc);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) {
    throw new Error("Could not determine today's Eastern calendar date");
  }
  return `${year}-${month}-${day}`;
}
