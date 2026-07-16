# Data contract

This app has two very different, very messy raw data sources — old spreadsheets
with a schema that drifts year to year, and (eventually) Vadim's report emails,
parsed by an LLM. Both are expected to get converted into the **same two clean
shapes** before the rest of the app ever touches them. That's the contract this
doc describes. Both types live in
[`src/lib/stats-engine/types.ts`](../src/lib/stats-engine/types.ts).

```
historical spreadsheets  ──> SeasonStandingRow ──> aggregateStandings() ──┐
                                                                            ├──> PlayerSeasonStats
future LLM report parsing ──> GameRecord[] ──> rollupGameRecords() ───────┘
```

Everything downstream of that convergence point — leaderboards, power rankings,
the demo page — only ever reads `PlayerSeasonStats`. It never needs to know or
care which of the two paths a given player's numbers came from.

## Identity resolution: flagged vs. auto-provisioned

Every raw name gets resolved via `resolvePlayerName()` (`identity.ts`) into one
of three states, and the two non-exact ones are handled differently on
purpose:

- **`exact`** — matches a known player's display name or alias exactly. Used as-is.
- **`flagged`** — no exact match, but close (edit distance) to a *different*
  existing player (e.g. "Gera" vs. "Gena," "Sasha SI" vs. "Sasha Ru"). Real
  misattribution risk if guessed wrong, so this is **never** auto-resolved —
  the row is excluded from aggregation and logged to `unresolved_names_log`
  for a human to confirm merge-or-not.
- **`unresolved`** — no fuzzy match to *anything* known. There's nothing for
  it to be confused with, so there's no misattribution risk — `createProvisionalIdentity()`
  (`identity.ts`) gives it a stable placeholder identity (`canonicalId: "auto-<slug>"`,
  `status: "provisional"`) deterministically from the raw text, and its stats
  are aggregated immediately, same as any confirmed player. The same raw name
  seen again (in this file or a later one) resolves to the same provisional
  identity — see `provisionedPlayers` in `aggregate.ts` and
  `backfill-to-supabase.ts`.

A provisional player can be upgraded to a confirmed one at any time by adding
the raw name as an alias for a real entry in `kaiser_player_identity.csv` and
re-running the backfill — the exact match then wins.

## `PlayerSeasonStats` — one player's aggregated stats, final form

The output contract. Whatever ingests new data, this is what it must produce.

| Field | Meaning |
|---|---|
| `canonicalId` | The player's stable id from the identity table (`kaiser_player_identity.csv` in real data, `data/sample/players.json` in the demo). Never a raw report-text name. |
| `displayName` | Human-readable name to render. |
| `games` / `wins` / `losses` / `ties` | Self-explanatory. |
| `goals` | Ground truth once validated (see `findPlusMinusMismatches` / the scorer-sum check in `season-standings-parser.ts` for the spreadsheet path's version of this validation). |
| `assists` | Counting stat only, never an input to the power ranking/golden boot (see `kaiser_BUILD_SPEC.md` for why — coverage bias). **Does now factor into per-game MVP as a minor tiebreaker** (updated 2026-07-16, overriding the original MVP exclusion — see `kaiser_BUILD_SPEC.md`'s MVP section), which is the only way it reaches `mvpCount`. **Always `0` from the spreadsheet-backfill path** — the historical spreadsheets never tracked assists, in any of the 5 years on file (confirmed in `kaiser_stats_engine_notes.md`). Only `rollupGameRecords()` can populate a nonzero value. |
| `plusMinus` | `wins − losses`. A derived stat, not an independent measure — see `findPlusMinusMismatches`. |
| `mvpCount` | Number of games this player was the app-derived MVP. **Always `0` from the spreadsheet-backfill path**, same reasoning as `assists` — MVP is computed from per-game report narrative, which the season spreadsheets never had. |
| `avgDraftPosition` | Average snake-draft pick number across every game this player was drafted in (1 = picked first that game), or `null` if never drafted / unknown. **Always `null` from the spreadsheet-backfill path** — draft order doesn't exist at season-aggregate granularity. Display-only: shown next to the power ranking as a performance-vs-draft-slot comparison (like fantasy sports' value-over-ADP), computed *after* ranking and never fed back into the sort — see `computePowerRankings()` in `rankings.ts` and `kaiser_BUILD_SPEC.md` on why draft order must never be a ranking input. |
| `notableMentions` | Verbatim report-narrative snippets naming this player (e.g. a standout zero-goal performance). **Always `[]` from the spreadsheet-backfill path.** Same reasoning as `assists`: coverage is too sparse/inconsistent (a mention only exists if a report happened to narrate that moment) to be a fair scored input, so it's qualitative context only — never folded into `mvpCount` or the power ranking. |
| `sources` | Provenance strings (one per contributing row/game) — e.g. `"soccer_2023.xlsx#Sheet1"` or `"email:19f3315cf733a148"`. Not user-facing; useful for debugging where a number came from. |

**Current limitation, honestly documented rather than hidden:** `aggregateStandings()`
sums across every row handed to it — it does not currently split by season/year.
In practice this means today's `PlayerSeasonStats` is really "career-to-date
across every spreadsheet parsed so far," not one season. Splitting by season is
a natural extension (the type already accommodates it via `sources`, since each
source string can be traced back to a specific file/year) but hasn't been needed
yet because the demo/UI doesn't have a season-scoped view. Add a `season` field
if and when that's actually needed — don't add it speculatively.

## `GameRecord` — one game's worth of data, final form

The shape the future LLM report-parser is expected to emit, one per game. By
the time a `GameRecord` exists, name resolution against the identity table has
already happened — every roster/scorer/assist/MVP field is a `canonicalId`,
never raw report text. That resolution step (fuzzy-match, flag-don't-merge) is
`resolvePlayerName()` in `identity.ts`, and it runs *before* a `GameRecord` is
considered valid, not after.

| Field | Meaning |
|---|---|
| `gameId` | Stable id for this game. |
| `date` | ISO 8601, e.g. `"2026-07-05"`. |
| `league` | `"saturday"` \| `"sunday"` \| `"unknown"`. |
| `homeRoster` / `awayRoster` | Arrays of `RosterSpot` = `{ canonicalId, pickNumber }`. `pickNumber` is the 1-indexed *overall* snake-draft pick for that game (not per-team) — this is what `rollupGameRecords()` averages into `avgDraftPosition`. |
| `homeScore` / `awayScore` | Final score. |
| `goals` | Array of `{ scorerCanonicalId, assistCanonicalId, team }`. `assistCanonicalId` is `null` when the report didn't narrate one — never guessed. |
| `mvpCanonicalId` | The app's own derived MVP call, or `null`. Never a fact Vadim stated, never another player's stated opinion (see `kaiser_BUILD_SPEC.md`). |
| `notableMentions` | Array of `{ canonicalId, quote }` — report-narrative snippets naming a player, kept separate from `mvpCanonicalId`. Rolls up into `PlayerSeasonStats.notableMentions`. |
| `source` | Provenance, e.g. `"email:<gmailThreadId>"`. |

`rollupGameRecords()` (`game-records.ts`) turns `GameRecord[]` into
`PlayerSeasonStats[]` — same output shape as the spreadsheet path, different
input. `src/lib/stats-engine/__tests__/game-records.test.ts` is the executable
proof the two paths agree on the contract.

**Now built:** `src/lib/report-parser/` turns a report email's text into a
`GameRecord`, via the Gemini API (Google's Flash tier — see
`src/lib/report-parser/gemini-client.ts` for why the model name is the
`gemini-flash-latest` alias rather than a hard-pinned dated model name — chosen
over the Claude API originally named in `kaiser_BUILD_SPEC.md` for cost reasons,
Gemini's free tier comfortably covers this project's actual usage), and an
admin-only web UI (`/matches/import`, see `docs/report-parsing.md`) now writes its
resolved output into the real `game_records`/`roster_spots`/`goal_events`/
`notable_mentions` tables. `data/sample/games.json` remains the hand-written fake
`GameRecord[]` data the public demo runs against — real imported reports land in
Supabase but aren't shown on the site yet (see "Going live with real data" below).

## Where new raw data goes

- **New historical spreadsheets** (more years, corrections, etc.): drop the raw
  `.xlsx`/`.pdf` file in **`private/incoming/`**. That folder — and all of
  `private/` — is gitignored; nothing placed there ever gets committed. Use the
  same naming convention the existing files already follow:
  `soccer_<year>.xlsx` for a full-year file, `soccer_<year>_<part>.xlsx` for a
  mid-season/partial snapshot (e.g. `soccer_2026_2.xlsx`). Whatever parses it
  should call `parsePrimaryStandingsSheet()` (or `parseAllStandingsSheets()` to
  inspect every sheet first) — don't assume the column layout matches last
  year's file, the schema drifts (see `kaiser_stats_engine_notes.md`).
- **New real identity/email data**: goes in `private/`, following the existing
  `kaiser_player_identity.csv` / `kaiser_email_index.csv` shape. Never at the
  repo root — see `kaiser_BUILD_SPEC.md`'s GitHub/repo-handling section for why.
- **New fake/sample data** (for tests or the public demo): goes in
  `data/sample/`, committed normally. **Naming footgun to avoid:** don't name a
  sample file `soccer*.xlsx` — the repo's `.gitignore` blanket-excludes that
  pattern to keep real spreadsheets out, and it'll silently swallow a fake file
  with the same prefix too (this happened once already; the sample workbook is
  named `sample_season.xlsx` specifically to dodge it).

## Persistent storage: Supabase

`supabase/schema.sql` defines a durable store for the contract's *inputs*
(`SeasonStandingRow`, and eventually `GameRecord`) — not a re-implementation
of `aggregateStandings()` / `rollupGameRecords()` in SQL. A future query layer
fetches rows from Supabase and runs them through the existing, tested
TypeScript aggregation functions, the same way the demo page runs
`data/sample/` through them today. See [`docs/supabase-setup.md`](supabase-setup.md)
for how to create the project and run the backfill (`scripts/backfill-to-supabase.ts`,
`npm run backfill`).

Tables map directly to types.ts shapes:

| Table | Mirrors |
|---|---|
| `players` | `PlayerIdentity` |
| `season_standing_rows` | `SeasonStandingRow` (post-parse, pre-aggregation) |
| `game_records`, `roster_spots`, `goal_events`, `notable_mentions` | `GameRecord` (populated via the admin `/matches/import` UI — see `docs/report-parsing.md`) |
| `unresolved_names_log` | `NameResolution` entries with `status === "flagged"` — genuinely ambiguous names, the durable "needs a human" queue, never auto-resolved |

Every table has Row Level Security enabled with **no public policies** — the
`anon`/public API key can read nothing. Only the `service_role` key (used
server-side by the backfill script, never shipped to a browser) can read or
write. This is a deliberate default, not a placeholder to fill in later.

## Going live with real data

**Table, Past Matches, and Player Detail** still read only `data/sample/` —
the fake dataset — regardless of whether real data exists in Supabase. This
remains a deliberate choice: flipping it means building a page that queries
Supabase (reusing `aggregateStandings()`/`rollupGameRecords()` against real
rows instead of `data/sample/`), which hasn't happened on purpose yet.

**Matchday is the exception.** As of the admin check-in slice, `/matchday`
and `/matchday/[gameId]` read real Supabase tables (`scheduled_games`,
`game_checkins` — see `src/lib/matchday/data.ts`), and the admin-only
`/matchday/[gameId]/edit` page writes to them (`src/lib/matchday/actions.ts`,
gated by `is_admin`, see `src/lib/auth/session.ts`'s `requireAdmin()`). This
was a deliberate, scoped decision — not a blanket "go live with everything."
Supabase environment variables are configured in Vercel specifically to
support this and the auth login flow, not as a signal that other pages have
also gone live.

## The live-report parser

`src/lib/report-parser/` reads a report email thread (see the thread-reading
rules in `kaiser_BUILD_SPEC.md` — full thread, not just the root message,
corrections in replies supersede the original) and emits one `GameRecord`.
Name resolution is never the LLM's job — `parse-report.ts` extracts raw name
strings only, then resolves each one via the exact same `resolvePlayerName()`
/ `createProvisionalIdentity()` code the spreadsheet-backfill path uses.
Everything downstream — rollup, leaderboards, rankings, the UI — needed no
changes at all, because it was built against this contract rather than
against whatever shape the spreadsheets happened to have. See
`docs/report-parsing.md` for how to run it.

Draft position (`pickNumber`) is computed by default for report-parsed games
(updated 2026-07-16, confirmed with the league organizer): the first-listed
player on each team's roster is that team's captain, and the rest of that
side's roster list is already in the order they were drafted, so the raw
roster order itself carries real per-team pick order. `resolveExtractionToGameRecord()`
assumes the team listed first picked first and alternates strict snake order
by default, refined further by a report's own narrated pick order (see
`prompt.ts` rule 10 / `pickOrderRaw`) or an explicit `First pick:` annotation
when either contradicts the default for a specific game (see
`docs/report-parsing.md`). Pick numbers are only left `null` when something
about a game's data is inconsistent enough not to trust (`firstPickWarning`).
`rollupGameRecords()` still treats a null pick number as "no data" and
excludes it from `avgDraftPosition` rather than treating it as 0 — this
still applies to spreadsheet-backfilled historical games, which predate any
of this and have no roster-order information to lean on at all.
