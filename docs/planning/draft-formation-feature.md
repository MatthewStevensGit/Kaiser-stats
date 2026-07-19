# Live draft formation feature — plan (not started)

Status: **planning only, no code written yet**. Parked so we could work on
something else; resume here when the user says "draft formation optimization"
or similar.

## Request (verbatim intent)

During a live draft, add an optional visual formation board per team: empty
position slots on a pitch diagram, sized/shaped to that team's actual player
count (not always 11v11 — this league runs anywhere from ~7-a-side to
~12-a-side). Captains can pick a formation (from a derived list, or type their
own), then drag each drafted player's name onto a slot matching one of that
player's own selected positions (from Settings/onboarding). Only one
goalkeeper, ever. The two teams in the same game can pick different, even
asymmetric, formations independently.

## Design

### 1. Base formation library (11-a-side)

Well-known real formations, each a Defense-Midfield-Attack split with fixed
(x, y) pitch coordinates per slot, reusing the existing 9 position codes
(`src/lib/stats-engine/positions.ts`: GK/LB/CB/RB/CM/CAM/LW/RW/ST):

- 4-3-3, 4-4-2, 4-2-3-1, 4-1-4-1, 3-5-2, 3-4-3, 5-3-2, 4-5-1

Back-4 → LB/CB/CB/RB. Back-3 → CB/CB/CB. Front-3 → LW/ST/RW. Etc. — reasonable
mappings since the position system doesn't distinguish e.g. wing-back from
fullback.

### 2. Scaling down for smaller team sizes

Team size per side is already computed server-side today (drives the
positional-need draft recommendation) — captain counts as one of the slots.

Algorithm (matches the user's own "4-3-3 minus one could be 3-3-3 or 4-2-3..."
example): for a target outfield count N, do a BFS from each base formation's
(Def, Mid, Att) triple, removing exactly one player from one line at a time,
until every reachable path hits total N. Union + dedupe the resulting triples
across all base formations — bounded, not exponential, and derived exactly the
way the user described. Never let Def or Mid drop below 1; Att can go to 1 (or
0 only in extreme small-sided cases).

Captains can also type a fully custom shape instead of picking a derived one.

### 3. UI/UX

- Once captains + turn-sizes are locked, each side gets a "Formation" picker:
  derived options for that side's exact size, or free-text custom.
- Picking one renders an empty pitch diagram (same visual style as standard
  formation graphics — circles + lines on a green pitch).
- Drag a drafted player's name onto any empty circle whose required position
  is in that player's own `positions[]`; reject otherwise. Players with no
  positions set are unrestricted (same "don't penalize unknowns" convention
  already used in the ADR/positional-need recommender).
- Purely a draft-time organizational tool — does not feed stats or
  `game_records`/`roster_spots`.

### 4. Persistence

New JSONB column(s) on `draft_sessions` (chosen shape + slot→canonicalId
assignments per side), so it survives a refresh mid-draft. Not part of the
final saved game/roster data model.

## Build order (multi-session; this is a genuinely large feature)

1. Formation library + the size-derivation algorithm — pure functions, fully
   unit-testable, no UI.
2. Static pitch rendering: picker + empty diagram only, no drag-drop.
3. Drag-and-drop assignment. **Open decision**: native HTML5 drag events are
   free but poor on mobile Safari/touch (this app is used on phones at the
   field) — leaning toward adding `@dnd-kit/core` (small, maintained, real
   touch support) instead of fighting native DnD. Confirm with user before
   adding the dependency.
4. Persistence (the `draft_sessions` JSONB column(s), manual Supabase SQL
   migration as usual).

## Relevant existing code to integrate with

- `src/lib/stats-engine/positions.ts` — the 9 position codes, player
  `positions[]`.
- `src/lib/matchday/position-need.ts` — existing positional-need logic for
  draft recommendations; same "unknown position = unrestricted" convention
  should carry over here.
- `src/app/_components/DraftPanel.tsx` / `src/lib/matchday/draft-actions.ts` —
  where side team-size is already computed (`getLiveDraftState`), and where
  the new Formation section would slot into the live-draft UI.
