import type { NameResolution, PlayerIdentity } from "./types";

/**
 * Report text is the primary key for stats attribution (see kaiser_BUILD_SPEC.md).
 * Vadim disambiguates duplicate first names himself in-report (e.g. "Sasha SI" vs
 * "Sasha Ru"), so an exact match against a known alias is trusted as-is. Anything
 * that isn't an exact match only ever comes back "flagged" — never auto-merged —
 * because short names are especially risky (Leo/Neo, Alan/Alen could be different
 * real people).
 */

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const SHORT_NAME_MAX_LENGTH = 5;
const FUZZY_MATCH_MAX_DISTANCE = 1;

export function resolvePlayerName(
  raw: string,
  knownPlayers: PlayerIdentity[],
): NameResolution {
  const rawNorm = normalize(raw);

  for (const player of knownPlayers) {
    const allNames = [player.displayName, ...player.aliases];
    if (allNames.some((n) => normalize(n) === rawNorm)) {
      return { raw, status: "exact", canonicalId: player.canonicalId, candidates: [] };
    }
  }

  const candidates: NameResolution["candidates"] = [];
  for (const player of knownPlayers) {
    const allNames = [player.displayName, ...player.aliases];
    let best = Infinity;
    for (const n of allNames) {
      const d = levenshtein(rawNorm, normalize(n));
      if (d < best) best = d;
    }
    // Short names get a tighter (still non-zero) tolerance: a 1-character edit
    // on a 4-5 letter name is exactly the Leo/Neo, Alan/Alen failure mode, so it
    // still surfaces as a flagged candidate for a human to confirm, not a match.
    const maxDistance = rawNorm.length <= SHORT_NAME_MAX_LENGTH
      ? FUZZY_MATCH_MAX_DISTANCE
      : FUZZY_MATCH_MAX_DISTANCE + 1;
    if (best <= maxDistance) {
      candidates.push({ canonicalId: player.canonicalId, displayName: player.displayName, distance: best });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);

  if (candidates.length > 0) {
    return { raw, status: "flagged", canonicalId: null, candidates };
  }
  return { raw, status: "unresolved", canonicalId: null, candidates: [] };
}

/**
 * A genuinely novel name (resolvePlayerName returned "unresolved" — zero
 * fuzzy candidates against the known list) carries no misattribution risk:
 * there's nothing similar it could be silently confused with. Unlike a
 * "flagged" name, it doesn't need a human decision before its stats can be
 * counted — it needs a stable identity to count them under, which this
 * creates. The canonicalId is deterministic (slug of the raw name, prefixed
 * "auto-") so every future row using the exact same raw text resolves to the
 * same provisional player consistently.
 *
 * This does NOT resolve a "flagged" name — a name close to an existing,
 * different one still requires a human to confirm merge-or-not, since
 * guessing wrong there means misattributing a real person's stats to
 * someone else.
 */
export function createProvisionalIdentity(rawName: string): PlayerIdentity {
  const trimmed = rawName.trim();
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return {
    canonicalId: `auto-${slug}`,
    displayName: trimmed,
    aliases: [],
    knownEmails: [],
    leagues: [],
    status: "provisional",
  };
}

/**
 * A verified login email with no match to any known player's knownEmails —
 * same "never block, auto-provision, flag for a human later" philosophy as
 * createProvisionalIdentity(), just keyed by email instead of a report name
 * (see src/lib/auth/actions.ts's linkPlayerAfterLogin()). displayName defaults to the email
 * itself so it's recognizable in the existing "auto-tracked new players"
 * admin surface until a human renames it.
 */
export function createProvisionalIdentityFromEmail(email: string): PlayerIdentity {
  const normalized = email.trim().toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return {
    canonicalId: `auto-${slug}`,
    displayName: normalized,
    aliases: [],
    knownEmails: [normalized],
    leagues: [],
    status: "provisional",
  };
}

/** Case-insensitive match against every known player's knownEmails. */
export function findPlayerByEmail(players: PlayerIdentity[], email: string): PlayerIdentity | null {
  const normalized = email.trim().toLowerCase();
  return players.find((p) => p.knownEmails.some((e) => e.toLowerCase() === normalized)) ?? null;
}
