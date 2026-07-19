/** Basic soccer positions a member can select as playable at onboarding (or have set by an admin). */
export const POSITIONS = ["GK", "LB", "CB", "RB", "CM", "CAM", "LW", "RW", "ST"] as const;
export type Position = (typeof POSITIONS)[number];

export function isPosition(value: string): value is Position {
  return (POSITIONS as readonly string[]).includes(value);
}

export const POSITION_LABELS: Record<Position, string> = {
  GK: "Goalkeeper",
  LB: "Left Back",
  CB: "Center Back",
  RB: "Right Back",
  CM: "Center Mid",
  CAM: "Attacking Mid",
  LW: "Left Wing",
  RW: "Right Wing",
  ST: "Striker",
};

/** Broader groupings the live draft's positional-need logic reasons about, rather than each of the 9 exact positions individually. */
export type PositionGroup = "goalkeeper" | "defense" | "midfield" | "attack";

export const POSITION_GROUPS: PositionGroup[] = ["goalkeeper", "defense", "midfield", "attack"];

export const POSITION_GROUP: Record<Position, PositionGroup> = {
  GK: "goalkeeper",
  LB: "defense",
  CB: "defense",
  RB: "defense",
  CM: "midfield",
  CAM: "midfield",
  LW: "attack",
  RW: "attack",
  ST: "attack",
};

/**
 * Standard 4-3-3-ish shape of an 11-player outfield-plus-keeper team (1
 * keeper : 4 defenders : 3 midfielders : 3 attackers) — scaled to whatever a
 * specific draft's actual team size turns out to be, see
 * src/lib/matchday/position-need.ts's targetQuota().
 */
export const POSITION_GROUP_TARGET_SHARE: Record<PositionGroup, number> = {
  goalkeeper: 1 / 11,
  defense: 4 / 11,
  midfield: 3 / 11,
  attack: 3 / 11,
};
