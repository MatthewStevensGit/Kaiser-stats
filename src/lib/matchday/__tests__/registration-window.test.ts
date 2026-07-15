import { describe, expect, it } from "vitest";
import { getRegistrationCutoffUtc, isRegistrationOpen } from "../registration-window";

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

describe("isRegistrationOpen", () => {
  const cutoff = new Date("2026-07-17T21:00:00.000Z"); // Fri 5pm EDT cutoff for Sat 2026-07-18

  it("is open strictly before the cutoff instant", () => {
    const oneMinuteBefore = new Date(cutoff.getTime() - 60_000);
    expect(isRegistrationOpen(oneMinuteBefore, "2026-07-18", "saturday")).toBe(true);
  });

  it("is closed exactly at the cutoff instant", () => {
    expect(isRegistrationOpen(cutoff, "2026-07-18", "saturday")).toBe(false);
  });

  it("is closed after the cutoff instant", () => {
    const oneMinuteAfter = new Date(cutoff.getTime() + 60_000);
    expect(isRegistrationOpen(oneMinuteAfter, "2026-07-18", "saturday")).toBe(false);
  });
});
