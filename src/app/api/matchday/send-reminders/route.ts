import { NextResponse } from "next/server";
import { buildReminderEmailContent, selectPendingReminders, sendReminderEmail } from "@/lib/matchday/reminders";
import { createServiceRoleClient } from "@/lib/supabase/client";

// Triggered by Vercel Cron (see vercel.json) — must never be cached or
// statically optimized. Same CRON_SECRET auth pattern as generate-week.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createServiceRoleClient();

  const [{ data: games }, { data: alreadySentRows }] = await Promise.all([
    client
      .from("scheduled_games")
      .select("game_id, date, league, cancelled_at")
      .gte("date", new Date().toISOString().slice(0, 10)),
    client.from("reminder_email_log").select("game_id, email_type"),
  ]);

  const alreadySent = new Set((alreadySentRows ?? []).map((r) => `${r.game_id}|${r.email_type}`));
  const candidateGames = (games ?? []).map((g) => ({
    gameId: g.game_id,
    date: g.date,
    league: g.league,
    cancelled: g.cancelled_at !== null,
  }));

  const pending = selectPendingReminders(candidateGames, new Date(), alreadySent);
  const results: { gameId: string; emailType: string; recipientCount: number }[] = [];

  for (const reminder of pending) {
    const game = candidateGames.find((g) => g.gameId === reminder.gameId);
    if (!game) continue;

    const [{ data: checkins }, { data: players }] = await Promise.all([
      client
        .from("game_checkins")
        .select("canonical_id")
        .eq("game_id", reminder.gameId)
        .is("removed_at", null),
      client.from("players").select("known_emails").contains("leagues", [game.league]),
    ]);

    const recipients = Array.from(
      new Set((players ?? []).flatMap((p) => p.known_emails ?? [])),
    );
    const { subject, body } = buildReminderEmailContent(reminder.emailType, game, checkins?.length ?? 0);

    await sendReminderEmail({ to: recipients, subject, body });

    const { error: logError } = await client.from("reminder_email_log").insert({
      game_id: reminder.gameId,
      email_type: reminder.emailType,
      recipient_count: recipients.length,
      dry_run: true,
    });
    // A unique-violation here just means another concurrent run already
    // logged this exact game+type — fine to ignore, not a real failure.
    if (logError && logError.code !== "23505") {
      return NextResponse.json({ error: "Failed to log reminder" }, { status: 500 });
    }

    results.push({ gameId: reminder.gameId, emailType: reminder.emailType, recipientCount: recipients.length });
  }

  return NextResponse.json({ ok: true, sent: results });
}
