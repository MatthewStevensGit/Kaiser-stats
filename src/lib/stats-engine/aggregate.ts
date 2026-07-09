import { resolvePlayerName } from "./identity";
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

export interface AggregateResult {
  players: PlayerSeasonStats[];
  unresolvedNames: NameResolution[];
}

/**
 * Resolves each row's raw player name against the known identity table and
 * sums totals per canonical player. Names that don't resolve exactly are
 * never silently merged (see kaiser_BUILD_SPEC.md) — they're returned in
 * `unresolvedNames` for a human to confirm, and excluded from the aggregate
 * so an unconfirmed guess never quietly inflates someone's stats.
 */
export function aggregateStandings(
  rows: SeasonStandingRow[],
  knownPlayers: PlayerIdentity[],
  view: StatsView,
): AggregateResult {
  const totals = new Map<string, PlayerSeasonStats>();
  const unresolvedNames: NameResolution[] = [];
  const seenUnresolved = new Set<string>();

  for (const row of rows) {
    if (!rowMatchesView(row, view)) continue;

    const resolution = resolvePlayerName(row.playerNameRaw, knownPlayers);
    if (resolution.status !== "exact" || !resolution.canonicalId) {
      const key = `${resolution.status}:${row.playerNameRaw.toLowerCase()}`;
      if (!seenUnresolved.has(key)) {
        seenUnresolved.add(key);
        unresolvedNames.push(resolution);
      }
      continue;
    }

    const player = knownPlayers.find((p) => p.canonicalId === resolution.canonicalId);
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

  return { players: Array.from(totals.values()), unresolvedNames };
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
