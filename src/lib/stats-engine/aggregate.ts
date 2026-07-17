import { createProvisionalIdentity, resolvePlayerName } from "./identity";
import type {
  NameResolution,
  PlayerIdentity,
  PlayerSeasonStats,
  PlusMinusMismatch,
  SeasonStandingRow,
  StatsView,
} from "./types";

/**
 * PLUS/MINUS = WINS − LOSSES, confirmed by direct arithmetic against the real
 * spreadsheets (see kaiser_stats_engine_notes.md). Treated as a cheap derived
 * stat, not an independent input — this flags any row where the stated value
 * doesn't match, the same way goal-sum mismatches get flagged for review
 * instead of silently trusted.
 */
export function findPlusMinusMismatches(rows: SeasonStandingRow[]): PlusMinusMismatch[] {
  const mismatches: PlusMinusMismatch[] = [];
  for (const row of rows) {
    if (row.plusMinus === null) continue;
    const expected = row.wins - row.losses;
    if (row.plusMinus !== expected) {
      mismatches.push({
        source: row.source,
        playerNameRaw: row.playerNameRaw,
        wins: row.wins,
        losses: row.losses,
        statedPlusMinus: row.plusMinus,
        expectedPlusMinus: expected,
      });
    }
  }
  return mismatches;
}

function rowMatchesView(row: SeasonStandingRow, view: StatsView): boolean {
  if (view === "merged") return true;
  return row.league === view;
}

const SOURCE_YEAR = /\d{4}/;

/**
 * Every season-standings source string embeds its year (e.g.
 * "soccer_2023_2.xlsx#Sheet1" -> "2023") — there's no separate year column
 * on SeasonStandingRow, so this is the only way to scope the Table page to
 * one season instead of the all-time total every row sums into today.
 * `year: "all"` (or anything that matches no row) is the existing
 * all-time-cumulative behavior, unchanged.
 */
export function filterSeasonStandingRowsByYear(
  rows: SeasonStandingRow[],
  year: string,
): SeasonStandingRow[] {
  if (year === "all") return rows;
  return rows.filter((row) => row.source.match(SOURCE_YEAR)?.[0] === year);
}

export interface AggregateResult {
  players: PlayerSeasonStats[];
  /** Names close to an existing, different identity — genuinely ambiguous, still need a human. */
  unresolvedNames: NameResolution[];
  /** Names with no fuzzy match to anything — auto-tracked under a new provisional identity, no risk of misattribution. */
  provisionedPlayers: PlayerIdentity[];
}

/**
 * Resolves each row's raw player name against the known identity table and
 * sums totals per canonical player.
 *
 * Two different kinds of "doesn't match an existing player," handled
 * differently (see kaiser_BUILD_SPEC.md's identity rules):
 * - "flagged" (close to a DIFFERENT existing name, e.g. "Gera" vs "Gena") —
 *   real misattribution risk if guessed wrong, so it's excluded from the
 *   aggregate and returned in `unresolvedNames` for a human to confirm.
 * - "unresolved" (no fuzzy match to anything at all, e.g. a name never seen
 *   before) — no misattribution risk, since there's nothing similar it could
 *   be confused with. Auto-provisioned into a stable identity (see
 *   createProvisionalIdentity) and included in the aggregate immediately;
 *   returned in `provisionedPlayers` so a human can later attach a real name.
 */
export function aggregateStandings(
  rows: SeasonStandingRow[],
  knownPlayers: PlayerIdentity[],
  view: StatsView,
): AggregateResult {
  const totals = new Map<string, PlayerSeasonStats>();
  const unresolvedNames: NameResolution[] = [];
  const seenFlagged = new Set<string>();
  const provisionedByRaw = new Map<string, PlayerIdentity>();

  for (const row of rows) {
    if (!rowMatchesView(row, view)) continue;

    const resolution = resolvePlayerName(row.playerNameRaw, knownPlayers);

    let player: PlayerIdentity | undefined;
    if (resolution.status === "exact" && resolution.canonicalId) {
      player = knownPlayers.find((p) => p.canonicalId === resolution.canonicalId);
    } else if (resolution.status === "flagged") {
      const key = row.playerNameRaw.toLowerCase();
      if (!seenFlagged.has(key)) {
        seenFlagged.add(key);
        unresolvedNames.push(resolution);
      }
      continue;
    } else {
      const key = row.playerNameRaw.trim().toLowerCase();
      player = provisionedByRaw.get(key);
      if (!player) {
        player = createProvisionalIdentity(row.playerNameRaw);
        provisionedByRaw.set(key, player);
      }
    }

    if (!player) continue;

    const existing = totals.get(player.canonicalId) ?? {
      canonicalId: player.canonicalId,
      displayName: player.displayName,
      games: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      goals: 0,
      // Never populated by this path — season-standings spreadsheets don't
      // have per-game granularity (see kaiser_stats_engine_notes.md). Only
      // the future GameRecord -> rollupGameRecords() path can fill these in.
      assists: 0,
      mvpCount: 0,
      avgDraftPosition: null,
      notableMentions: [],
      plusMinus: 0,
      sources: [],
    };

    existing.games += row.games;
    existing.wins += row.wins;
    existing.losses += row.losses;
    existing.ties += row.ties;
    existing.goals += row.goals ?? 0;
    existing.plusMinus += row.plusMinus ?? row.wins - row.losses;
    existing.sources.push(row.source);

    totals.set(player.canonicalId, existing);
  }

  return {
    players: Array.from(totals.values()),
    unresolvedNames,
    provisionedPlayers: Array.from(provisionedByRaw.values()),
  };
}

/**
 * Ranks by a per-game rate stat with a minimum-games floor. Vadim's own
 * goals-per-game leaderboard has no floor and lets 1-game sample sizes
 * dominate (see kaiser_BUILD_SPEC.md) — this is the fix.
 */
export function rankByRate(
  players: PlayerSeasonStats[],
  statKey: "goals",
  minGames: number,
): (PlayerSeasonStats & { rate: number })[] {
  return players
    .filter((p) => p.games >= minGames)
    .map((p) => ({ ...p, rate: p[statKey] / p.games }))
    .sort((a, b) => b.rate - a.rate);
}

export interface SeasonAwardWinners {
  year: number;
  /** Every player tied for that season's top plus/minus — ties share the title rather than picking one arbitrarily (no tiebreaker data exists to break it correctly). */
  leagueWinnerIds: string[];
  /** Every player tied for that season's Golden Boot, by the same raw-goals-first ranking the Golden Boot tab itself displays (see rankByRate + src/app/page.tsx's sort). */
  goldenBootWinnerIds: string[];
}

/**
 * One closed season's awards — only ever meaningful for a season that's
 * actually over (see season_stats_cutoff's doc comment in
 * supabase/schema.sql: a year with no cutoff row is a fully closed season;
 * an in-progress one's current "leader" isn't a real title yet, so callers
 * should never pass an in-progress year's rows here).
 */
export function computeSeasonAwards(
  yearRows: SeasonStandingRow[],
  knownPlayers: PlayerIdentity[],
  year: number,
  goldenBootMinGames: number,
): SeasonAwardWinners {
  const { players: totals } = aggregateStandings(yearRows, knownPlayers, "merged");
  if (totals.length === 0) return { year, leagueWinnerIds: [], goldenBootWinnerIds: [] };

  const maxPlusMinus = Math.max(...totals.map((p) => p.plusMinus));
  const leagueWinnerIds = totals.filter((p) => p.plusMinus === maxPlusMinus).map((p) => p.canonicalId);

  const eligible = rankByRate(totals, "goals", goldenBootMinGames);
  let goldenBootWinnerIds: string[] = [];
  if (eligible.length > 0) {
    const maxGoals = Math.max(...eligible.map((p) => p.goals));
    goldenBootWinnerIds = eligible.filter((p) => p.goals === maxGoals).map((p) => p.canonicalId);
  }

  return { year, leagueWinnerIds, goldenBootWinnerIds };
}

export interface AwardTally {
  leagueTitleYears: number[];
  goldenBootYears: number[];
}

/**
 * Tallies league titles and Golden Boots per player across every closed
 * season's awards — keeps the actual YEAR of each win (not just a count),
 * so the UI can show e.g. "'23 '24" instead of an opaque "x2".
 */
export function tallyAwardCounts(awards: SeasonAwardWinners[]): Map<string, AwardTally> {
  const tally = new Map<string, AwardTally>();
  function bump(canonicalId: string, key: keyof AwardTally, year: number) {
    const existing = tally.get(canonicalId) ?? { leagueTitleYears: [], goldenBootYears: [] };
    existing[key].push(year);
    tally.set(canonicalId, existing);
  }
  for (const award of awards) {
    for (const id of award.leagueWinnerIds) bump(id, "leagueTitleYears", award.year);
    for (const id of award.goldenBootWinnerIds) bump(id, "goldenBootYears", award.year);
  }
  return tally;
}
