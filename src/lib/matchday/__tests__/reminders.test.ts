import { describe, expect, it } from "vitest";
import { buildReminderEmailContent, selectPendingReminders } from "../reminders";
import type { ReminderCandidateGame } from "../reminders";

// 2026-07-18 is a Saturday; registration opens Fri 2026-07-17 00:00 ET
// (04:00 UTC in EDT) and closes Fri 2026-07-17 17:00 ET (21:00 UTC) — same
// real dates already confirmed in registration-window.test.ts.
const saturdayGame: ReminderCandidateGame = {
  gameId: "matchday-2026-07-18",
  date: "2026-07-18",
  league: "saturday",
  cancelled: false,
};

describe("selectPendingReminders", () => {
  it("is not due before registration opens", () => {
    const beforeOpen = new Date("2026-07-16T23:00:00.000Z");
    expect(selectPendingReminders([saturdayGame], beforeOpen, new Set())).toEqual([]);
  });

  it("fires 'registration_open' once registration has opened", () => {
    const justAfterOpen = new Date("2026-07-17T04:30:00.000Z");
    expect(selectPendingReminders([saturdayGame], justAfterOpen, new Set())).toEqual([
      { gameId: saturdayGame.gameId, emailType: "registration_open" },
    ]);
  });

  it("doesn't re-fire 'registration_open' if already logged", () => {
    const justAfterOpen = new Date("2026-07-17T04:30:00.000Z");
    const alreadySent = new Set([`${saturdayGame.gameId}|registration_open`]);
    expect(selectPendingReminders([saturdayGame], justAfterOpen, alreadySent)).toEqual([]);
  });

  it("fires 'closing_soon' once inside the last hour before close, alongside registration_open if that's also still pending", () => {
    // Closes 21:00 UTC -> 1 hour before is 20:00 UTC.
    const oneHourBeforeClose = new Date("2026-07-17T20:15:00.000Z");
    expect(selectPendingReminders([saturdayGame], oneHourBeforeClose, new Set())).toEqual([
      { gameId: saturdayGame.gameId, emailType: "registration_open" },
      { gameId: saturdayGame.gameId, emailType: "closing_soon" },
    ]);
  });

  it("fires only 'closing_soon' when registration_open was already sent", () => {
    const oneHourBeforeClose = new Date("2026-07-17T20:15:00.000Z");
    const alreadySent = new Set([`${saturdayGame.gameId}|registration_open`]);
    expect(selectPendingReminders([saturdayGame], oneHourBeforeClose, alreadySent)).toEqual([
      { gameId: saturdayGame.gameId, emailType: "closing_soon" },
    ]);
  });

  it("fires nothing after registration has closed", () => {
    const afterClose = new Date("2026-07-17T22:00:00.000Z");
    expect(selectPendingReminders([saturdayGame], afterClose, new Set())).toEqual([]);
  });

  it("skips a cancelled game entirely", () => {
    const justAfterOpen = new Date("2026-07-17T04:30:00.000Z");
    expect(selectPendingReminders([{ ...saturdayGame, cancelled: true }], justAfterOpen, new Set())).toEqual([]);
  });
});

describe("buildReminderEmailContent", () => {
  it("mentions the league and doesn't mention spots for the registration_open email", () => {
    const { subject, body } = buildReminderEmailContent("registration_open", saturdayGame, 5);
    expect(subject).toContain("Saturday");
    expect(body.toLowerCase()).toContain("open");
  });

  it("includes spots left and the checked-in count for the closing_soon email", () => {
    const { subject, body } = buildReminderEmailContent("closing_soon", saturdayGame, 20);
    expect(subject).toContain("1 hour");
    expect(body).toContain("4 spots left");
    expect(body).toContain("20/24");
  });

  it("never reports negative spots left if somehow over capacity", () => {
    const { body } = buildReminderEmailContent("closing_soon", saturdayGame, 30);
    expect(body).toContain("0 spots left");
  });
});
