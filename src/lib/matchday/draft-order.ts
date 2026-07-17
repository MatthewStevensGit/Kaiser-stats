export type DraftSide = "home" | "away";

/**
 * The confirmed pick-sequence rule (multiple rounds of back-and-forth with the user to
 * pin down — see the "Live Snake Draft" plan): sides alternate strictly turn by turn,
 * EXCEPT turn 4, which is a double-pick for whichever side picked second. This is a
 * fixed positional rule, not parity-dependent — it applies the same way whether
 * `remainingCount` is even or odd. Net effect: the side that picked second ends up with
 * one extra player overall. For `remainingCount < 5` there's no room for the double —
 * just straight alternation.
 *
 * Worked example (firstSide "home"): picks 1,2,3,4,5,6 -> home, away, home, away, away,
 * home, then continues alternating home/away from pick 7 onward.
 */
export function buildDefaultTurnSizes(remainingCount: number): number[] {
  if (remainingCount <= 0) return [];
  if (remainingCount < 5) return Array(remainingCount).fill(1);
  return [1, 1, 1, 2, ...Array(remainingCount - 5).fill(1)];
}

/** Expands a turn-size sequence into a per-pick side sequence, alternating sides each new turn. */
export function expandTurnsToSides(turnSizes: number[], firstSide: DraftSide): DraftSide[] {
  const sides: DraftSide[] = [];
  let currentSide = firstSide;
  for (const size of turnSizes) {
    for (let i = 0; i < size; i++) sides.push(currentSide);
    currentSide = currentSide === "home" ? "away" : "home";
  }
  return sides;
}

/**
 * Parses an admin-typed turn-size override (space/dash/comma-separated positive
 * integers, e.g. "1 1 1 2 1 1 1" or "1-1-1-2-1-1-1") for the rare game where the
 * computed default isn't what the captains want. Validates it sums to exactly
 * `remainingCount` — anything else means picks would be lost or invented.
 */
export function parseManualTurnSizes(
  raw: string,
  remainingCount: number,
): { ok: true; turnSizes: number[] } | { ok: false; error: string } {
  const parts = raw.trim().split(/[\s,-]+/).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: "Enter at least one turn size." };

  const turnSizes: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, error: `"${part}" isn't a positive whole number.` };
    }
    turnSizes.push(n);
  }

  const sum = turnSizes.reduce((total, n) => total + n, 0);
  if (sum !== remainingCount) {
    return {
      ok: false,
      error: `Turn sizes add up to ${sum}, but there are ${remainingCount} players left to draft — they must match exactly.`,
    };
  }

  return { ok: true, turnSizes };
}
