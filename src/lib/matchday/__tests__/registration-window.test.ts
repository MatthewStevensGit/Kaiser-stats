import { describe, expect, it } from "vitest";
import {
  getRegistrationOpenUtc,
  getRegistrationCutoffUtc,
  getRegistrationStatus,
  getTodayIsoInEastern,
} from "../registration-window";

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
