import { KICKOFF_LABEL_BY_LEAGUE, VENUE_BY_LEAGUE } from "./constants";
import { addDaysToIsoDate, getTodayIsoInEastern } from "./registration-window";
import { createServiceRoleClient } from "../supabase/client";
import type { ScheduledGame, ScheduledLeague } from "./types";

const LIST_HORIZON_DAYS = 7;

interface ScheduledGameRow {
  game_id: string;
  date: string;
  league: ScheduledLeague;
  kickoff_label: string | null;
  venue: string | null;
  cancelled_at: string | null;
}

interface CheckinRow {
  game_id: string;
  canonical_id: string;
}

const SCHEDULED_GAME_COLUMNS = "game_id, date, league, kickoff_label, venue, cancelled_at";

/**
 * Groups scheduled-game rows with their active (non-removed) check-ins, and
 * resolves each game's display kickoff/venue (its own override, or the
 * league-wide constant) and cancellation flag. Pure — no Supabase call — so
 * it's unit-testable on its own; see __tests__/data.test.ts.
 */
export function buildScheduledGames(
  gameRows: ScheduledGameRow[],
  activeCheckinRows: CheckinRow[],
): ScheduledGame[] {
  const checkedInByGame = new Map<string, string[]>();
  for (const row of activeCheckinRows) {
    const list = checkedInByGame.get(row.game_id) ?? [];
    list.push(row.canonical_id);
    checkedInByGame.set(row.game_id, list);
  }

  return gameRows.map((g) => ({
    gameId: g.game_id,
    date: g.date,
    league: g.league,
    checkedInCanonicalIds: checkedInByGame.get(g.game_id) ?? [],
    kickoffLabel: g.kickoff_label ?? KICKOFF_LABEL_BY_LEAGUE[g.league],
    venue: g.venue ?? VENUE_BY_LEAGUE[g.league],
    cancelled: g.cancelled_at !== null,
  }));
}

/** Never-cancelled games in the next LIST_HORIZON_DAYS days — the /matchday list. */
export async function listScheduledGames(): Promise<ScheduledGame[]> {
  const client = createServiceRoleClient();

  const todayIso = getTodayIsoInEastern(new Date());
  const horizonIso = addDaysToIsoDate(todayIso, LIST_HORIZON_DAYS);

  const [{ data: games }, { data: checkins }] = await Promise.all([
    client
      .from("scheduled_games")
      .select(SCHEDULED_GAME_COLUMNS)
      .is("cancelled_at", null)
      .gte("date", todayIso)
      .lte("date", horizonIso),
    client.from("game_checkins").select("game_id, canonical_id").is("removed_at", null),
  ]);

  return buildScheduledGames(
    (games ?? []) as ScheduledGameRow[],
    (checkins ?? []) as CheckinRow[],
  );
}

/**
 * Looks up a game by id regardless of cancellation status — a cancelled
 * game must still resolve here (not null) so its check-in portal page can
 * render a "this game has been cancelled" state instead of 404ing.
 */
export async function getScheduledGameById(gameId: string): Promise<ScheduledGame | null> {
  const client = createServiceRoleClient();

  const [{ data: game }, { data: checkins }] = await Promise.all([
    client.from("scheduled_games").select(SCHEDULED_GAME_COLUMNS).eq("game_id", gameId).maybeSingle(),
    client
      .from("game_checkins")
      .select("game_id, canonical_id")
      .eq("game_id", gameId)
      .is("removed_at", null),
  ]);

  if (!game) return null;

  return buildScheduledGames(
    [game as ScheduledGameRow],
    (checkins ?? []) as CheckinRow[],
  )[0]!;
}

export interface CheckinDetail {
  canonicalId: string;
  displayName: string;
  checkedInAt: string;
  checkedInByDisplayName: string;
}

/**
 * Admin-only detail view: who's checked in, when, and by whom. Not exported
 * for public pages — this module isn't itself an authz boundary, every
 * caller is responsible for checking admin-ness first (see
 * src/lib/auth/session.ts's requireAdmin(), and the independent check inside
 * every Server Action in src/lib/matchday/actions.ts).
 */
export async function getGameCheckinDetails(gameId: string): Promise<CheckinDetail[]> {
  const client = createServiceRoleClient();

  const { data: checkins } = await client
    .from("game_checkins")
    .select("canonical_id, checked_in_at, checked_in_by")
    .eq("game_id", gameId)
    .is("removed_at", null)
    .order("checked_in_at", { ascending: true });

  if (!checkins || checkins.length === 0) return [];

  const involvedIds = Array.from(
    new Set(checkins.flatMap((c) => [c.canonical_id, c.checked_in_by])),
  );
  const { data: players } = await client
    .from("players")
    .select("canonical_id, display_name")
    .in("canonical_id", involvedIds);

  const nameById = new Map((players ?? []).map((p) => [p.canonical_id, p.display_name]));

  return checkins.map((c) => ({
    canonicalId: c.canonical_id,
    displayName: nameById.get(c.canonical_id) ?? c.canonical_id,
    checkedInAt: c.checked_in_at,
    checkedInByDisplayName: nameById.get(c.checked_in_by) ?? c.checked_in_by,
  }));
}

/** The known roster, minus anyone already checked in and anyone deferred. Admin-only. */
export async function getRosterForPicker(
  excludingCanonicalIds: string[],
): Promise<{ canonicalId: string; displayName: string }[]> {
  const client = createServiceRoleClient();

  const { data: players } = await client
    .from("players")
    .select("canonical_id, display_name, status")
    .order("display_name", { ascending: true });

  const excluded = new Set(excludingCanonicalIds);
  return (players ?? [])
    .filter((p) => p.status !== "deferred" && !excluded.has(p.canonical_id))
    .map((p) => ({ canonicalId: p.canonical_id, displayName: p.display_name }));
}
