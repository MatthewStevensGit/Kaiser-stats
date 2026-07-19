import { NextResponse } from "next/server";
import {
  buildLineupEmailContent,
  buildReminderEmailContent,
  selectPendingReminders,
  SENDING_ENABLED,
  sendReminderEmail,
} from "@/lib/matchday/reminders";
import { draftGameId } from "@/lib/report-parser/save";
import { rosterDisplayName } from "@/lib/stats-engine/identity";
import { createServiceRoleClient } from "@/lib/supabase/client";

// Triggered by a GitHub Actions scheduled workflow
// (.github/workflows/send-reminders-cron.yml), not Vercel's own native Cron —
// confirmed the hard way that Vercel's Hobby plan only allows once-per-day
// cron schedules, too coarse for "1 hour before close" reminders, and a
// more-frequent vercel.json entry fails the whole deployment. Same
// CRON_SECRET auth pattern as generate-week either way. Must never be cached
// or statically optimized.
export const dynamic = "force-dynamic";

interface PlayerNameRow {
  canonical_id: string;
  display_name: string;
  roster_name: string | null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createServiceRoleClient();

  const [{ data: games }, { data: alreadySentRows }, { data: allPlayers }] = await Promise.all([
    client
      .from("scheduled_games")
      .select("game_id, date, league, cancelled_at, registration_cutoff_override")
      .gte("date", new Date().toISOString().slice(0, 10)),
    client.from("reminder_email_log").select("game_id, email_type"),
    client.from("players").select("canonical_id, display_name, roster_name, known_emails, leagues"),
  ]);

  const nameByCanonicalId = new Map<string, string>(
    ((allPlayers ?? []) as (PlayerNameRow & { known_emails: string[]; leagues: string[] })[]).map((p) => [
      p.canonical_id,
      rosterDisplayName({ displayName: p.display_name, rosterName: p.roster_name }),
    ]),
  );
  const alreadySent = new Set((alreadySentRows ?? []).map((r) => `${r.game_id}|${r.email_type}`));

  // Fetched up front (not lazily per-pending-reminder) since checkedInCount
  // now also drives the registration_filled trigger itself, not just its
  // email body.
  const checkinCountsByGame = new Map<string, number>();
  for (const game of games ?? []) {
    const { count } = await client
      .from("game_checkins")
      .select("canonical_id", { count: "exact", head: true })
      .eq("game_id", game.game_id)
      .is("removed_at", null);
    checkinCountsByGame.set(game.game_id, count ?? 0);
  }

  const candidateGames = (games ?? []).map((g) => ({
    gameId: g.game_id,
    date: g.date,
    league: g.league,
    cancelled: g.cancelled_at !== null,
    cutoffOverrideUtc: g.registration_cutoff_override ? new Date(g.registration_cutoff_override) : null,
    checkedInCount: checkinCountsByGame.get(g.game_id) ?? 0,
  }));

  const pending = selectPendingReminders(candidateGames, new Date(), alreadySent);
  const results: { gameId: string; emailType: string; recipientCount: number }[] = [];

  for (const reminder of pending) {
    const game = candidateGames.find((g) => g.gameId === reminder.gameId);
    if (!game) continue;

    const recipients = Array.from(
      new Set(
        ((allPlayers ?? []) as { known_emails: string[]; leagues: string[] }[])
          .filter((p) => p.leagues?.includes(game.league))
          .flatMap((p) => p.known_emails ?? []),
      ),
    );

    let rosterNames: string[] = [];
    if (reminder.emailType === "registration_filled") {
      const { data: checkins } = await client
        .from("game_checkins")
        .select("canonical_id")
        .eq("game_id", reminder.gameId)
        .is("removed_at", null);
      rosterNames = (checkins ?? []).map((c) => nameByCanonicalId.get(c.canonical_id) ?? c.canonical_id);
    }

    const { subject, body } = buildReminderEmailContent(reminder.emailType, game, game.checkedInCount, rosterNames);

    const sent = await sendReminderEmail({ to: recipients, subject, body });
    if (!sent) continue; // Not logged — retried on the next cron tick instead of being silently skipped forever.

    const { error: logError } = await client.from("reminder_email_log").insert({
      game_id: reminder.gameId,
      email_type: reminder.emailType,
      recipient_count: recipients.length,
      dry_run: !SENDING_ENABLED,
    });
    // A unique-violation here just means another concurrent run already
    // logged this exact game+type — fine to ignore, not a real failure.
    if (logError && logError.code !== "23505") {
      return NextResponse.json({ error: "Failed to log reminder" }, { status: 500 });
    }

    results.push({ gameId: reminder.gameId, emailType: reminder.emailType, recipientCount: recipients.length });
  }

  // Lineup emails: a wholly separate trigger (a completed draft session, not
  // the registration-window/capacity math above) — checked independently
  // rather than folded into selectPendingReminders, which only ever looks at
  // scheduled_games + check-in counts.
  const { data: completedSessions } = await client.from("draft_sessions").select("game_id, league").eq("status", "completed");

  for (const session of completedSessions ?? []) {
    if (alreadySent.has(`${session.game_id}|lineup_ready`)) continue;

    const { data: scheduledGame } = await client
      .from("scheduled_games")
      .select("date, league")
      .eq("game_id", session.game_id)
      .maybeSingle();
    if (!scheduledGame) continue;

    const gameRecordId = draftGameId(scheduledGame.date, scheduledGame.league);
    const [{ data: rosterRows }, { data: gameRecord }] = await Promise.all([
      client.from("roster_spots").select("canonical_id, side").eq("game_id", gameRecordId),
      client.from("game_records").select("home_team_label, away_team_label").eq("game_id", gameRecordId).maybeSingle(),
    ]);
    if (!rosterRows || !gameRecord) continue;

    const homeNames = rosterRows
      .filter((r) => r.side === "home")
      .map((r) => nameByCanonicalId.get(r.canonical_id) ?? r.canonical_id);
    const awayNames = rosterRows
      .filter((r) => r.side === "away")
      .map((r) => nameByCanonicalId.get(r.canonical_id) ?? r.canonical_id);

    const recipients = Array.from(
      new Set(
        ((allPlayers ?? []) as { known_emails: string[]; leagues: string[] }[])
          .filter((p) => p.leagues?.includes(session.league))
          .flatMap((p) => p.known_emails ?? []),
      ),
    );

    const { subject, body } = buildLineupEmailContent(
      { date: scheduledGame.date, league: scheduledGame.league },
      {
        homeTeamLabel: gameRecord.home_team_label,
        awayTeamLabel: gameRecord.away_team_label,
        homeNames,
        awayNames,
      },
    );

    const sent = await sendReminderEmail({ to: recipients, subject, body });
    if (!sent) continue;

    const { error: logError } = await client.from("reminder_email_log").insert({
      game_id: session.game_id,
      email_type: "lineup_ready",
      recipient_count: recipients.length,
      dry_run: !SENDING_ENABLED,
    });
    if (logError && logError.code !== "23505") {
      return NextResponse.json({ error: "Failed to log lineup reminder" }, { status: 500 });
    }

    results.push({ gameId: session.game_id, emailType: "lineup_ready", recipientCount: recipients.length });
  }

  return NextResponse.json({ ok: true, sent: results });
}
