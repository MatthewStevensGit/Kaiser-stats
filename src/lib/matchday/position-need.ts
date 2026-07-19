import { POSITION_GROUP, POSITION_GROUP_TARGET_SHARE, type Position, type PositionGroup } from "../stats-engine/positions";

/** At least 1 slot of room per group even for a tiny team, so rounding never fully zeroes a group out. */
export function targetQuota(group: PositionGroup, teamSize: number): number {
  return Math.max(1, Math.round(POSITION_GROUP_TARGET_SHARE[group] * teamSize));
}

/**
 * How many of a team's current players (captain + picks so far) already
 * cover each position group. A versatile player who lists positions in two
 * different groups (e.g. CB and CM) counts toward both — this is a "how many
 * people who CAN play this group are on the team" tally, not a strict
 * one-slot-per-player formation.
 */
export function countFilledGroups(rosterPositions: Position[][]): Record<PositionGroup, number> {
  const counts: Record<PositionGroup, number> = { goalkeeper: 0, defense: 0, midfield: 0, attack: 0 };
  for (const positions of rosterPositions) {
    const groupsHit = new Set(positions.map((p) => POSITION_GROUP[p]));
    for (const group of groupsHit) counts[group] += 1;
  }
  return counts;
}

/**
 * A remaining player is still "positionally needed" if ANY position they
 * play belongs to a group that hasn't hit its target quota yet for this
 * team's size — or if they haven't listed any positions at all (unknown
 * versatility is never held against them). Only once EVERY position they
 * play is already at or over quota do they stop being recommended, no
 * matter how good their draft position history is (see getLiveDraftState in
 * draft-actions.ts, which sorts positionally-needed players ahead of
 * positionally-satisfied ones before ADR breaks the tie within each group).
 */
export function isPositionallyNeeded(
  playerPositions: Position[],
  filledCounts: Record<PositionGroup, number>,
  teamSize: number,
): boolean {
  if (playerPositions.length === 0) return true;
  return playerPositions.some((p) => filledCounts[POSITION_GROUP[p]] < targetQuota(POSITION_GROUP[p], teamSize));
}
