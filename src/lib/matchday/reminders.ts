import { LEAGUE_CAPACITY_BY_LEAGUE } from "./constants";
import { getRegistrationWindowUtc } from "./registration-window";
import type { ScheduledLeague } from "./types";

/**
 * Explicit project decision (2026-07-19): real emails now go out via Gmail
 * SMTP (see src/lib/email/send-mail.ts) — flip back to false to return to
 * dry-run/log-only mode without touching anything else here.
 */
export const SENDING_ENABLED = true;

export type ReminderEmailType = "registration_open" | "closing_soon" | "registration_filled" | "lineup_ready";

const ONE_HOUR_MS = 60 * 60 * 1000;

export interface ReminderCandidateGame {
  gameId: string;
  date: string;
  league: ScheduledLeague;
  cancelled: boolean;
  cutoffOverrideUtc: Date | null;
  /** Needed to detect the moment a game hits capacity — see the registration_filled check below. */
  checkedInCount: number;
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
    const capacity = LEAGUE_CAPACITY_BY_LEAGUE[game.league];

    if (now >= opensAt && now < closesAt && !alreadySent.has(`${game.gameId}|registration_open`)) {
      pending.push({ gameId: game.gameId, emailType: "registration_open" });
    }
    if (now >= oneHourBeforeClose && now < closesAt && !alreadySent.has(`${game.gameId}|closing_soon`)) {
      pending.push({ gameId: game.gameId, emailType: "closing_soon" });
    }
    // Fires the instant a game hits capacity, whenever that happens to be —
    // doesn't wait for closesAt, and unlike the two reminders above, once
    // sent it never re-fires even if the roster later dips back under
    // capacity (a removed check-in shouldn't undo an already-announced roster).
    if (now >= opensAt && game.checkedInCount >= capacity && !alreadySent.has(`${game.gameId}|registration_filled`)) {
      pending.push({ gameId: game.gameId, emailType: "registration_filled" });
    }
  }

  return pending;
}

/** Plain-text email content for one registration-lifecycle reminder — pure, so it's testable without touching Supabase or Gmail. `rosterNames` is only used (and only needed) for registration_filled. */
export function buildReminderEmailContent(
  emailType: ReminderEmailType,
  game: { date: string; league: ScheduledLeague },
  checkedInCount: number,
  rosterNames: string[] = [],
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

  if (emailType === "registration_filled") {
    return {
      subject: `Kaiser ${leagueLabel} league — registration is full`,
      body: `This week's ${leagueLabel} game is fully checked in (${capacity}/${capacity}). Here's the roster:\n\n${rosterNames.join("\n")}`,
    };
  }

  return {
    subject: `Kaiser ${leagueLabel} league — 1 hour left to register`,
    body: `Registration for this week's ${leagueLabel} game closes in about 1 hour. ${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left (${checkedInCount}/${capacity} checked in) — check in now if you're playing.`,
  };
}

/** Plain-text email content for the final drafted lineup — pure and separately testable, since its trigger (a completed draft session) and data shape (two team rosters, not a single checked-in count) are unrelated to the registration-lifecycle emails above. */
export function buildLineupEmailContent(
  game: { date: string; league: ScheduledLeague },
  teams: { homeTeamLabel: string; awayTeamLabel: string; homeNames: string[]; awayNames: string[] },
): { subject: string; body: string } {
  const leagueLabel = game.league === "saturday" ? "Saturday" : "Sunday";
  return {
    subject: `Kaiser ${leagueLabel} league — lineup is set`,
    body: `Teams are set for this week's ${leagueLabel} game:\n\n${teams.homeTeamLabel}:\n${teams.homeNames.join("\n")}\n\n${teams.awayTeamLabel}:\n${teams.awayNames.join("\n")}`,
  };
}

/**
 * The only place that ever actually sends mail — dry-run/log-only unless
 * SENDING_ENABLED is true (see its doc comment above). Returns whether the
 * reminder was actually sent (or dry-run logged) so the cron route only
 * writes a reminder_email_log row on success — a real failure (bad
 * credentials, transient network error) must NOT get logged, since
 * reminder_email_log's unique(game_id, email_type) is exactly what stops a
 * reminder from ever firing again: logging a failed send would silently
 * skip that game's reminder forever instead of retrying on the next cron tick.
 */
export async function sendReminderEmail(params: {
  to: string[];
  subject: string;
  body: string;
}): Promise<boolean> {
  if (!SENDING_ENABLED) {
    console.log(`[DRY RUN] Would send "${params.subject}" to ${params.to.length} recipient(s).`);
    return true;
  }
  if (params.to.length === 0) return true;

  const { sendMailViaGmail } = await import("../email/send-mail");
  try {
    await sendMailViaGmail(params);
    return true;
  } catch (err) {
    console.error(`Failed to send "${params.subject}" to ${params.to.length} recipient(s):`, err);
    return false;
  }
}
