import type { ScheduledLeague } from "./types";

/**
 * As stated by the project owner (overrides different draft numbers in
 * kaiser_step1_concept.md, which are marked owner-unconfirmed there) — still
 * subject to change once actually confirmed with Vadim, hence named
 * constants rather than inlined literals. Same "display-only, not final"
 * spirit as avgDraftPosition's comment in stats-engine/types.ts.
 */
export const LEAGUE_CAPACITY = 22;
export const LEAGUE_MINIMUM = 12;

export const VENUE_BY_LEAGUE: Record<ScheduledLeague, string> = {
  saturday: "Kaiser Park",
  sunday: "Brielle",
};

export const KICKOFF_LABEL_BY_LEAGUE: Record<ScheduledLeague, string> = {
  saturday: "7:00 AM ET",
  sunday: "7:30 AM ET",
};

/** Day-before registration close times. dayOffset is relative to the game's own ISO date. */
export const REGISTRATION_CUTOFF_BY_LEAGUE: Record<
  ScheduledLeague,
  { dayOffset: number; hour: number; minute: number }
> = {
  saturday: { dayOffset: -1, hour: 17, minute: 0 }, // Friday 5:00 PM ET
  sunday: { dayOffset: -1, hour: 15, minute: 0 }, // Saturday 3:00 PM ET
};

/** Day-before registration open times. Same dayOffset convention as the close-time rule above. */
export const REGISTRATION_OPEN_BY_LEAGUE: Record<
  ScheduledLeague,
  { dayOffset: number; hour: number; minute: number }
> = {
  saturday: { dayOffset: -1, hour: 0, minute: 0 }, // Friday 12:00 AM ET
  sunday: { dayOffset: -1, hour: 10, minute: 0 }, // Saturday 10:00 AM ET
};
