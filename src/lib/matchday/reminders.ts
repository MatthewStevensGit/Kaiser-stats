import { LEAGUE_CAPACITY_BY_LEAGUE } from "./constants";
import { getRegistrationWindowUtc } from "./registration-window";
import type { ScheduledLeague } from "./types";

/**
 * Explicit project decision (2026-07-17): real emails don't go out yet —
 * still in the demo phase. Flipping this to true is the ONLY change needed
 * once that's ready (see sendReminderEmail below) — everything else here
 * (timing, recipients, copy) is already real and tested.
 */
export const SENDING_ENABLED = false;

export type ReminderEmailType = "registration_open" | "closing_soon";

const ONE_HOUR_MS = 60 * 60 * 1000;

export interface ReminderCandidateGame {
  gameId: string;
  date: string;
  league: ScheduledLeague;
  cancelled: boolean;
  cutoffOverrideUtc: Date | null;
}

export interface PendingReminder {
  gameId: string;
  emailType: ReminderEmailType;
}

/**
 * Which (game, email type) pairs are due right now and haven't already been
 * sent/logged — `alreadySent` keys are `"<gameId>|<emailType>"`, matching
 * reminder_email_log's unique(game_id, email_type) constraint (see
 * supabase/schema.sql). Deliberately a plain "is now past the trigger
 * instant" check, not a tight window — the cron may run hours apart (see
 * vercel.json), so this just needs to catch each trigger on whichever tick
 * comes after it, exactly once, which the alreadySent set guarantees.
 */
export function selectPendingReminders(
  games: ReminderCandidateGame[],
  now: Date,
  alreadySent: Set<string>,
): PendingReminder[] {
  const pending: PendingReminder[] = [];

  for (const game of games) {
    if (game.cancelled) continue;
    const { opensAt, closesAt } = getRegistrationWindowUtc(game.date, game.league, game.cutoffOverrideUtc);
    const oneHourBeforeClose = new Date(closesAt.getTime() - ONE_HOUR_MS);

    if (now >= opensAt && now < closesAt && !alreadySent.has(`${game.gameId}|registration_open`)) {
      pending.push({ gameId: game.gameId, emailType: "registration_open" });
    }
    if (now >= oneHourBeforeClose && now < closesAt && !alreadySent.has(`${game.gameId}|closing_soon`)) {
      pending.push({ gameId: game.gameId, emailType: "closing_soon" });
    }
  }

  return pending;
}

/** Plain-text email content for one reminder — pure, so it's testable without touching Supabase or SendGrid. */
export function buildReminderEmailContent(
  emailType: ReminderEmailType,
  game: { date: string; league: ScheduledLeague },
  checkedInCount: number,
): { subject: string; body: string } {
  const leagueLabel = game.league === "saturday" ? "Saturday" : "Sunday";
  const capacity = LEAGUE_CAPACITY_BY_LEAGUE[game.league];
  const spotsLeft = Math.max(0, capacity - checkedInCount);

  if (emailType === "registration_open") {
    return {
      subject: `Kaiser ${leagueLabel} league — registration is open`,
      body: `Registration for this week's ${leagueLabel} game is now open. Check in on the site to grab your spot.`,
    };
  }

  return {
    subject: `Kaiser ${leagueLabel} league — 1 hour left to register`,
    body: `Registration for this week's ${leagueLabel} game closes in about 1 hour. ${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left (${checkedInCount}/${capacity} checked in) — check in now if you're playing.`,
  };
}

/**
 * The only place that would ever actually call SendGrid — currently always
 * a no-op logger (SENDING_ENABLED is false). Never throws either way, so a
 * dry run and a real send have the same caller-facing contract.
 */
export async function sendReminderEmail(params: {
  to: string[];
  subject: string;
  body: string;
}): Promise<void> {
  if (!SENDING_ENABLED) {
    console.log(`[DRY RUN] Would send "${params.subject}" to ${params.to.length} recipient(s).`);
    return;
  }
  // Intentionally unimplemented until SENDING_ENABLED is flipped on for
  // real — that change should come with the actual SendGrid API call added
  // here, not before.
  throw new Error("Real reminder-email sending isn't implemented yet.");
}
