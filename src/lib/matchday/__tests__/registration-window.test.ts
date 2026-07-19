import { describe, expect, it } from "vitest";
import {
  computeMatchdayStatusTier,
  deriveLeagueFromDate,
  formatEasternDateTimeLocal,
  getCheckinExpiryUtc,
  getGameStartUtc,
  getRegistrationOpenUtc,
  getRegistrationCutoffUtc,
  getRegistrationStatus,
  getTodayIsoInEastern,
  parseEasternDateTimeToUtc,
  resolveRegistrationCutoffUtc,
} from "../registration-window";

describe("deriveLeagueFromDate", () => {
  it("derives saturday for a Saturday date", () => {
    expect(deriveLeagueFromDate("2026-07-18")).toBe("saturday");
  });

  it("derives sunday for a Sunday date", () => {
    expect(deriveLeagueFromDate("2026-07-19")).toBe("sunday");
  });

  it("defaults to sunday for a weekday date (any date is allowed for a one-off game)", () => {
    expect(deriveLeagueFromDate("2026-07-15")).toBe("sunday");
  });
});

describe("getRegistrationCutoffUtc", () => {
  it("computes the Friday-5pm-ET cutoff for a Saturday game in EST (winter)", () => {
    // 2026-01-10 is a Saturday; Jan is before the 2026 DST start (Mar 8), so EST (UTC-5).
    expect(getRegistrationCutoffUtc("2026-01-10", "saturday").toISOString()).toBe(
      "2026-01-09T22:00:00.000Z",
    );
  });

  it("computes the Friday-5pm-ET cutoff for a Saturday game in EDT (summer)", () => {
    // 2026-07-18 is a Saturday; July is within DST, so EDT (UTC-4).
    expect(getRegistrationCutoffUtc("2026-07-18", "saturday").toISOString()).toBe(
      "2026-07-17T21:00:00.000Z",
    );
  });

  it("computes the Saturday-3pm-ET cutoff for a Sunday game in EST (winter)", () => {
    // 2026-01-11 is a Sunday.
    expect(getRegistrationCutoffUtc("2026-01-11", "sunday").toISOString()).toBe(
      "2026-01-10T20:00:00.000Z",
    );
  });

  it("computes the Saturday-3pm-ET cutoff for a Sunday game in EDT (summer)", () => {
    // 2026-07-19 is a Sunday.
    expect(getRegistrationCutoffUtc("2026-07-19", "sunday").toISOString()).toBe(
      "2026-07-18T19:00:00.000Z",
    );
  });

  it("resolves correctly across the spring-forward boundary (2026-03-08, 2am ET)", () => {
    // Saturday game the week DST begins: cutoff Friday 2026-03-06, still EST.
    expect(getRegistrationCutoffUtc("2026-03-07", "saturday").toISOString()).toBe(
      "2026-03-06T22:00:00.000Z",
    );
    // Saturday game the week after: cutoff Friday 2026-03-13, now EDT.
    expect(getRegistrationCutoffUtc("2026-03-14", "saturday").toISOString()).toBe(
      "2026-03-13T21:00:00.000Z",
    );
  });

  it("resolves correctly across the fall-back boundary (2026-11-01, 2am ET)", () => {
    // Sunday game 2026-11-01 itself: cutoff Saturday 2026-10-31, still EDT.
    expect(getRegistrationCutoffUtc("2026-11-01", "sunday").toISOString()).toBe(
      "2026-10-31T19:00:00.000Z",
    );
    // Saturday game the following week: cutoff Friday 2026-11-06, now EST.
    expect(getRegistrationCutoffUtc("2026-11-07", "saturday").toISOString()).toBe(
      "2026-11-06T22:00:00.000Z",
    );
  });

  it("uses genuinely different rules per league, not one shared constant", () => {
    const saturdayCutoff = getRegistrationCutoffUtc("2026-07-18", "saturday").getTime();
    const sundayCutoff = getRegistrationCutoffUtc("2026-07-18", "sunday").getTime();
    // Same reference date, but Friday-5pm vs Saturday-3pm rules diverge by
    // more than just the 2-hour time-of-day difference (also a day apart).
    expect(saturdayCutoff).not.toBe(sundayCutoff);
  });
});

describe("resolveRegistrationCutoffUtc", () => {
  it("falls back to the computed league default when no override is given", () => {
    expect(resolveRegistrationCutoffUtc("2026-07-18", "saturday", null).toISOString()).toBe(
      getRegistrationCutoffUtc("2026-07-18", "saturday").toISOString(),
    );
  });

  it("uses the override instead of the computed default when one is given", () => {
    const override = new Date("2026-07-16T12:00:00.000Z");
    expect(resolveRegistrationCutoffUtc("2026-07-18", "saturday", override)).toBe(override);
  });
});

describe("cutoff override threading through the public API", () => {
  it("getRegistrationStatus treats a later override as still open past the computed default cutoff", () => {
    const computedClose = getRegistrationCutoffUtc("2026-07-18", "saturday");
    const later = new Date(computedClose.getTime() + 60 * 60_000);
    // Just after the computed default close, but the override pushes it an hour later.
    const justAfterDefault = new Date(computedClose.getTime() + 1000);
    expect(getRegistrationStatus(justAfterDefault, "2026-07-18", "saturday", later)).toBe("open");
    expect(getRegistrationStatus(justAfterDefault, "2026-07-18", "saturday", null)).toBe("closed");
  });

  it("computeMatchdayStatusTier respects an earlier override, closing sooner than the computed default", () => {
    const computedClose = getRegistrationCutoffUtc("2026-07-18", "saturday");
    // 2 hours earlier than the computed default — comfortably past the 1-hour
    // "closing-soon" threshold either way, so the two branches land in
    // different tiers rather than both landing in "closing-soon".
    const earlier = new Date(computedClose.getTime() - 2 * 60 * 60_000);
    const justAfterEarlierOverride = new Date(earlier.getTime() + 1000);
    expect(computeMatchdayStatusTier(justAfterEarlierOverride, "2026-07-18", "saturday", 5, 24, earlier)).toBe(
      "closed",
    );
    expect(computeMatchdayStatusTier(justAfterEarlierOverride, "2026-07-18", "saturday", 5, 24, null)).toBe("open");
  });
});

describe("parseEasternDateTimeToUtc / formatEasternDateTimeLocal", () => {
  it("round-trips a known Eastern instant through both directions", () => {
    const utc = parseEasternDateTimeToUtc("2026-07-17T17:00");
    expect(utc.toISOString()).toBe(getRegistrationCutoffUtc("2026-07-18", "saturday").toISOString());
    expect(formatEasternDateTimeLocal(utc)).toBe("2026-07-17T17:00");
  });

  it("throws on a malformed datetime-local value", () => {
    expect(() => parseEasternDateTimeToUtc("not-a-date")).toThrow();
  });
});

describe("getRegistrationOpenUtc", () => {
  it("computes the Friday-midnight-ET open for a Saturday game in EST (winter)", () => {
    expect(getRegistrationOpenUtc("2026-01-10", "saturday").toISOString()).toBe(
      "2026-01-09T05:00:00.000Z",
    );
  });

  it("computes the Friday-midnight-ET open for a Saturday game in EDT (summer)", () => {
    expect(getRegistrationOpenUtc("2026-07-18", "saturday").toISOString()).toBe(
      "2026-07-17T04:00:00.000Z",
    );
  });

  it("computes the Saturday-10am-ET open for a Sunday game in EST (winter)", () => {
    expect(getRegistrationOpenUtc("2026-01-11", "sunday").toISOString()).toBe(
      "2026-01-10T15:00:00.000Z",
    );
  });

  it("computes the Saturday-10am-ET open for a Sunday game in EDT (summer)", () => {
    expect(getRegistrationOpenUtc("2026-07-19", "sunday").toISOString()).toBe(
      "2026-07-18T14:00:00.000Z",
    );
  });

  it("resolves the midnight-ET Saturday open correctly across the spring-forward weekend, despite only a ~2 day margin to the transition", () => {
    // Friday 2026-03-06 midnight, still EST (transition is Sunday 2026-03-08 2am ET).
    expect(getRegistrationOpenUtc("2026-03-07", "saturday").toISOString()).toBe(
      "2026-03-06T05:00:00.000Z",
    );
    // Friday 2026-03-13 midnight, now EDT.
    expect(getRegistrationOpenUtc("2026-03-14", "saturday").toISOString()).toBe(
      "2026-03-13T04:00:00.000Z",
    );
  });

  it("resolves the midnight-ET Saturday open correctly across the fall-back weekend", () => {
    // Friday 2026-10-30 midnight, still EDT (transition is Sunday 2026-11-01 2am ET).
    expect(getRegistrationOpenUtc("2026-10-31", "saturday").toISOString()).toBe(
      "2026-10-30T04:00:00.000Z",
    );
    // Friday 2026-11-06 midnight, now EST.
    expect(getRegistrationOpenUtc("2026-11-07", "saturday").toISOString()).toBe(
      "2026-11-06T05:00:00.000Z",
    );
  });

  it("resolves the Saturday-10am-ET Sunday open correctly for a game on the transition day itself (~16h margin)", () => {
    // Sunday game 2026-03-08 IS the spring-forward day; its open (Saturday
    // 2026-03-07, 10am) is well before the 2am transition, still EST.
    expect(getRegistrationOpenUtc("2026-03-08", "sunday").toISOString()).toBe(
      "2026-03-07T15:00:00.000Z",
    );
  });
});

describe("getRegistrationStatus", () => {
  const opensAt = new Date("2026-07-17T04:00:00.000Z"); // Fri midnight EDT open for Sat 2026-07-18
  const closesAt = new Date("2026-07-17T21:00:00.000Z"); // Fri 5pm EDT close for Sat 2026-07-18

  it("is not-open strictly before the open instant", () => {
    const oneMinuteBefore = new Date(opensAt.getTime() - 60_000);
    expect(getRegistrationStatus(oneMinuteBefore, "2026-07-18", "saturday")).toBe("not-open");
  });

  it("is open at and after the open instant, strictly before the close instant", () => {
    expect(getRegistrationStatus(opensAt, "2026-07-18", "saturday")).toBe("open");
    const oneMinuteBeforeClose = new Date(closesAt.getTime() - 60_000);
    expect(getRegistrationStatus(oneMinuteBeforeClose, "2026-07-18", "saturday")).toBe("open");
  });

  it("is closed at and after the close instant", () => {
    expect(getRegistrationStatus(closesAt, "2026-07-18", "saturday")).toBe("closed");
    const oneMinuteAfter = new Date(closesAt.getTime() + 60_000);
    expect(getRegistrationStatus(oneMinuteAfter, "2026-07-18", "saturday")).toBe("closed");
  });
});

describe("computeMatchdayStatusTier", () => {
  // Same Fri-midnight-open / Fri-5pm-close window as getRegistrationStatus's
  // suite above, for a Saturday 2026-07-18 game.
  const opensAt = new Date("2026-07-17T04:00:00.000Z");
  const closesAt = new Date("2026-07-17T21:00:00.000Z");

  it("is scheduled before registration opens", () => {
    const before = new Date(opensAt.getTime() - 60_000);
    expect(computeMatchdayStatusTier(before, "2026-07-18", "saturday", 0, 24)).toBe("scheduled");
  });

  it("is open right after registration opens, with plenty of time left", () => {
    expect(computeMatchdayStatusTier(opensAt, "2026-07-18", "saturday", 5, 24)).toBe("open");
  });

  it("is closing-soon once under an hour remains before the cutoff", () => {
    const underAnHourLeft = new Date(closesAt.getTime() - 30 * 60_000);
    expect(computeMatchdayStatusTier(underAnHourLeft, "2026-07-18", "saturday", 5, 24)).toBe(
      "closing-soon",
    );
    const exactlyOneHourLeft = new Date(closesAt.getTime() - 60 * 60_000);
    expect(computeMatchdayStatusTier(exactlyOneHourLeft, "2026-07-18", "saturday", 5, 24)).toBe("open");
  });

  it("is closed once the cutoff passes, if never filled", () => {
    expect(computeMatchdayStatusTier(closesAt, "2026-07-18", "saturday", 10, 24)).toBe("closed");
  });

  it("is filled once capacity is reached, even with hours left before the cutoff", () => {
    expect(computeMatchdayStatusTier(opensAt, "2026-07-18", "saturday", 24, 24)).toBe("filled");
  });

  it("stays filled after the cutoff passes too", () => {
    expect(computeMatchdayStatusTier(closesAt, "2026-07-18", "saturday", 24, 24)).toBe("filled");
  });
});

describe("getTodayIsoInEastern", () => {
  it("returns the Eastern calendar date, not the UTC one, near midnight ET", () => {
    // 2026-07-18T02:00:00Z is 2026-07-17 10:00 PM EDT — still the 17th in ET,
    // even though it's already the 18th in UTC.
    expect(getTodayIsoInEastern(new Date("2026-07-18T02:00:00.000Z"))).toBe("2026-07-17");
  });

  it("resolves correctly straddling the fall-back weekend", () => {
    // 2026-11-01T23:30:00Z: at that instant it's already EST (transition at
    // 2026-11-01 06:00 UTC), so 23:30 UTC - 5h = 18:30 ET, still Nov 1.
    expect(getTodayIsoInEastern(new Date("2026-11-01T23:30:00.000Z"))).toBe("2026-11-01");
  });
});

describe("getGameStartUtc", () => {
  it("computes 7:00 AM ET kickoff for a Saturday game (EDT)", () => {
    expect(getGameStartUtc("2026-07-18", "saturday").toISOString()).toBe("2026-07-18T11:00:00.000Z");
  });

  it("computes 7:30 AM ET kickoff for a Sunday game (EDT)", () => {
    expect(getGameStartUtc("2026-07-19", "sunday").toISOString()).toBe("2026-07-19T11:30:00.000Z");
  });
});

describe("getCheckinExpiryUtc", () => {
  it("is one hour after Saturday's 7:00 AM ET kickoff", () => {
    expect(getCheckinExpiryUtc("2026-07-18", "saturday").toISOString()).toBe("2026-07-18T12:00:00.000Z");
  });

  it("is one hour after Sunday's 7:30 AM ET kickoff", () => {
    expect(getCheckinExpiryUtc("2026-07-19", "sunday").toISOString()).toBe("2026-07-19T12:30:00.000Z");
  });
});
