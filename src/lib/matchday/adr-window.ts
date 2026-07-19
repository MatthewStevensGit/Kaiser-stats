import type { League } from "../stats-engine/types";

export type AdrWindow = "all" | "last3" | "last5" | "last10" | "1m" | "3m" | "6m" | "ytd" | "1y";

export const ADR_WINDOW_OPTIONS: { id: AdrWindow; label: string }[] = [
  { id: "all", label: "All Time" },
  { id: "last3", label: "Last 3 Games" },
  { id: "last5", label: "Last 5 Games" },
  { id: "last10", label: "Last 10 Games" },
  { id: "1m", label: "Last Month" },
  { id: "3m", label: "Last 3 Months" },
  { id: "6m", label: "Last 6 Months" },
  { id: "ytd", label: "Year to Date" },
  { id: "1y", label: "Last Year" },
];

/**
 * Below this many games in a window, the average is still shown (never
 * hidden — a player with even a single game's worth of data should have it
 * displayed and count toward recommendations) but flagged as a low-sample
 * warning in the UI — see draftPickAdr's "!" badge in DraftPanel.tsx. Same
 * reasoning as GOLDEN_BOOT_MIN_GAMES elsewhere, just used as a warning
 * threshold now rather than a hide threshold.
 */
export const LOW_SAMPLE_GAME_THRESHOLD = 3;

/** Game-count-based windows: a player's own last N games in that scope, not a date cutoff — see LAST_N_WINDOW_SIZE. */
const LAST_N_WINDOW_SIZE: Partial<Record<AdrWindow, number>> = { last3: 3, last5: 5, last10: 10 };

/** One recorded draft pick, stripped down to just what a window filter/average needs — see getLiveDraftState in draft-actions.ts. */
export interface PickHistoryEntry {
  canonicalId: string;
  date: string;
  league: League;
  pickNumber: number;
}

/**
 * `saturday`/`sunday`/`both` are null only when there are literally zero
 * games in that scope+window — never hidden just for a small sample size.
 * The matching `*Games` field is always the exact count the average (if
 * any) was computed from, so the UI can flag a low sample (< LOW_SAMPLE_GAME_THRESHOLD)
 * without hiding the number itself.
 */
export interface WindowedAdr {
  saturday: number | null;
  sunday: number | null;
  both: number | null;
  saturdayGames: number;
  sundayGames: number;
  bothGames: number;
}

/**
 * ISO cutoff date (inclusive) for a date-based window as of `now` — null for
 * "all" (no cutoff at all). Not meaningful for a game-count window
 * (last5/last10 — see LAST_N_WINDOW_SIZE); callers branch on that first.
 */
export function windowCutoffIso(window: AdrWindow, now: Date): string | null {
  if (window === "all" || LAST_N_WINDOW_SIZE[window] !== undefined) return null;
  if (window === "ytd") return `${now.getFullYear()}-01-01`;

  const cutoff = new Date(now);
  if (window === "1m") cutoff.setMonth(cutoff.getMonth() - 1);
  else if (window === "3m") cutoff.setMonth(cutoff.getMonth() - 3);
  else if (window === "6m") cutoff.setMonth(cutoff.getMonth() - 6);
  else if (window === "1y") cutoff.setFullYear(cutoff.getFullYear() - 1);
  return cutoff.toISOString().slice(0, 10);
}

/** null only for zero games — any real sample (even 1 game) gets a real average; the caller separately tracks the count for a low-sample warning. */
function averageOrNull(pickNumbers: number[]): number | null {
  if (pickNumbers.length === 0) return null;
  return pickNumbers.reduce((a, b) => a + b, 0) / pickNumbers.length;
}

/**
 * A player's own most recent `n` games within one scope (Saturday-only,
 * Sunday-only, or both combined) — sorted newest-first, then capped — not
 * the league's last N games as a whole, same "their own actual history"
 * philosophy as computeRecentForm() in stats-engine/game-records.ts.
 */
function mostRecent(entries: PickHistoryEntry[], n: number): PickHistoryEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, n);
}

/** Narrows a player's own history down to whichever window's scope: either their last N games, or everything on/after a date cutoff. */
function selectWindowedEntries(scopedEntries: PickHistoryEntry[], window: AdrWindow, now: Date): PickHistoryEntry[] {
  const n = LAST_N_WINDOW_SIZE[window];
  if (n !== undefined) return mostRecent(scopedEntries, n);

  const cutoff = windowCutoffIso(window, now);
  return scopedEntries.filter((h) => cutoff === null || h.date >= cutoff);
}

/**
 * Recomputes a player's Sat/Sun/Both ADR restricted to a chosen window —
 * always computed and shown once there's at least one qualifying game, even
 * a single one (a real number with a "low sample" warning beats hiding it —
 * a player who's only played a game or two still deserves a visible, if
 * noisy, average rather than looking like a total unknown). Each of the
 * three scopes is windowed independently (e.g. "Last 5 Games" means their
 * own last 5 Saturday games for the Saturday column, not 5 games overall
 * filtered down to whichever happened to be Saturday). This is a pure
 * client-safe recompute over the same pick history data the server sends
 * down once, so switching the dropdown re-sorts the live pick list instantly
 * with no extra round trip mid-draft.
 */
export function computeWindowedAdr(
  history: PickHistoryEntry[],
  canonicalId: string,
  window: AdrWindow,
  now: Date,
): WindowedAdr {
  const own = history.filter((h) => h.canonicalId === canonicalId);
  const saturdayEntries = selectWindowedEntries(own.filter((e) => e.league === "saturday"), window, now);
  const sundayEntries = selectWindowedEntries(own.filter((e) => e.league === "sunday"), window, now);
  const bothEntries = selectWindowedEntries(own, window, now);
  return {
    saturday: averageOrNull(saturdayEntries.map((e) => e.pickNumber)),
    sunday: averageOrNull(sundayEntries.map((e) => e.pickNumber)),
    both: averageOrNull(bothEntries.map((e) => e.pickNumber)),
    saturdayGames: saturdayEntries.length,
    sundayGames: sundayEntries.length,
    bothGames: bothEntries.length,
  };
}

/**
 * Recomputes every remaining player's ADR for the chosen window, then
 * re-sorts them the same way the server does for "all time" (positionally-
 * needed players ahead of positionally-satisfied ones, ascending "both" ADR
 * within each group, nulls last) — just against the windowed numbers instead.
 * `positionallyNeeded` itself never changes with the window (it's about
 * roster slots filled, not time), only the ADR figures and their ordering do.
 */
export function applyAdrWindow<T extends { canonicalId: string; positionallyNeeded: boolean }>(
  remaining: T[],
  history: PickHistoryEntry[],
  window: AdrWindow,
  now: Date,
): (T & { avgDraftPosition: WindowedAdr })[] {
  return remaining
    .map((p) => ({ ...p, avgDraftPosition: computeWindowedAdr(history, p.canonicalId, window, now) }))
    .sort((a, b) => {
      if (a.positionallyNeeded !== b.positionallyNeeded) return a.positionallyNeeded ? -1 : 1;
      const aKey = a.avgDraftPosition.both;
      const bKey = b.avgDraftPosition.both;
      if (aKey === null && bKey === null) return 0;
      if (aKey === null) return 1;
      if (bKey === null) return -1;
      return aKey - bKey;
    });
}
