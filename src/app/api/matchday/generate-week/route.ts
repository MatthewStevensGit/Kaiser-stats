import { NextResponse } from "next/server";
import { computeNextWeekGameDates } from "@/lib/matchday/generate-week";
import { createServiceRoleClient } from "@/lib/supabase/client";

// Triggered weekly by Vercel Cron (see vercel.json) — must never be cached
// or statically optimized.
export const dynamic = "force-dynamic";

/**
 * Generates next week's Saturday + Sunday scheduled_games rows. Idempotent
 * (upsert ... ignoreDuplicates) so a manual re-run or a Vercel retry never
 * duplicates or errors. Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` on cron-triggered requests when
 * CRON_SECRET is set in the project's env vars — this is the standard
 * documented Vercel Cron auth pattern, not a bespoke scheme.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const games = computeNextWeekGameDates(new Date());
  const client = createServiceRoleClient();

  const { error } = await client.from("scheduled_games").upsert(
    games.map((g) => ({
      game_id: `matchday-${g.date}`,
      date: g.date,
      league: g.league,
      is_recurring: true,
    })),
    { onConflict: "game_id", ignoreDuplicates: true },
  );

  if (error) {
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, generated: games });
}
