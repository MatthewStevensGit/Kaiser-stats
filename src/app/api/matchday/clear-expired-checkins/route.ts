import { NextResponse } from "next/server";
import { getCheckinExpiryUtc } from "@/lib/matchday/registration-window";
import type { ScheduledLeague } from "@/lib/matchday/types";
import { createServiceRoleClient } from "@/lib/supabase/client";

// Triggered by Vercel Cron (see vercel.json) — must never be cached or
// statically optimized. Same CRON_SECRET auth pattern as generate-week /
// send-reminders.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createServiceRoleClient();
  const now = new Date();

  // Only the (game_id, date, league) of games with at least one currently-active
  // check-in are candidates — no point checking every scheduled game ever.
  const { data: activeCheckins } = await client
    .from("game_checkins")
    .select("game_id")
    .is("removed_at", null);

  const candidateGameIds = Array.from(new Set((activeCheckins ?? []).map((r) => r.game_id)));
  if (candidateGameIds.length === 0) {
    return NextResponse.json({ ok: true, gamesCleared: 0, checkinsRemoved: 0 });
  }

  const { data: games } = await client
    .from("scheduled_games")
    .select("game_id, date, league")
    .in("game_id", candidateGameIds);

  const expiredGameIds = (games ?? [])
    .filter((g) => now >= getCheckinExpiryUtc(g.date, g.league as ScheduledLeague))
    .map((g) => g.game_id);

  if (expiredGameIds.length === 0) {
    return NextResponse.json({ ok: true, gamesCleared: 0, checkinsRemoved: 0 });
  }

  // Soft-delete, same convention as every other check-in removal (see
  // cancelSelfCheckIn/removeCheckIn in matchday/actions.ts) — removed_by is
  // left null since this isn't any particular person's action, and the
  // column is nullable for exactly this case.
  const { data: removed, error } = await client
    .from("game_checkins")
    .update({ removed_at: now.toISOString() })
    .in("game_id", expiredGameIds)
    .is("removed_at", null)
    .select("id");

  if (error) {
    return NextResponse.json({ error: "Failed to clear expired check-ins" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    gamesCleared: expiredGameIds.length,
    checkinsRemoved: removed?.length ?? 0,
  });
}
