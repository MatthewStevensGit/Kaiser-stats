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

## `PlayerSeasonStats` — one player's aggregated stats, final form

The output contract. Whatever ingests new data, this is what it must produce.

| Field | Meaning |
|---|---|
| `canonicalId` | The player's stable id from the identity table (`kaiser_player_identity.csv` in real data, `data/sample/players.json` in the demo). Never a raw report-text name. |
| `displayName` | Human-readable name to render. |
| `games` / `wins` / `losses` / `ties` | Self-explanatory. |
| `goals` | Ground truth once validated (see `findPlusMinusMismatches` / the scorer-sum check in `season-standings-parser.ts` for the spreadsheet path's version of this validation). |
| `assists` | Counting stat only, never an input to `mvpCount` or the power ranking (see `kaiser_BUILD_SPEC.md` for why). **Always `0` from the spreadsheet-backfill path** — the historical spreadsheets never tracked assists, in any of the 5 years on file (confirmed in `kaiser_stats_engine_notes.md`). Only `rollupGameRecords()` can populate a nonzero value. |
| `plusMinus` | `wins − losses`. A derived stat, not an independent measure — see `findPlusMinusMismatches`. |
| `mvpCount` | Number of games this player was the app-derived MVP. **Always `0` from the spreadsheet-backfill path**, same reasoning as `assists` — MVP is computed from per-game report narrative, which the season spreadsheets never had. |
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
| `homeRoster` / `awayRoster` | Arrays of `canonicalId`. |
| `homeScore` / `awayScore` | Final score. |
| `goals` | Array of `{ scorerCanonicalId, assistCanonicalId, team }`. `assistCanonicalId` is `null` when the report didn't narrate one — never guessed. |
| `mvpCanonicalId` | The app's own derived MVP call, or `null`. Never a fact Vadim stated, never another player's stated opinion (see `kaiser_BUILD_SPEC.md`). |
| `source` | Provenance, e.g. `"email:<gmailThreadId>"`. |

`rollupGameRecords()` (`game-records.ts`) turns `GameRecord[]` into
`PlayerSeasonStats[]` — same output shape as the spreadsheet path, different
input. `src/lib/stats-engine/__tests__/game-records.test.ts` is the executable
proof the two paths agree on the contract.

**Not built yet:** the actual LLM parser that turns a report email into a
`GameRecord`. That's the "live report parsing" step in `kaiser_BUILD_SPEC.md`,
gated on a Claude API key. `data/sample/games.json` is hand-written fake
`GameRecord[]` data standing in for that parser's future output, so the rest of
the pipeline (`rollupGameRecords`, the MVP/assists demo section) can be built
and tested against the right shape today.

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
  repo root — see `kaiser_github_setup.md` for why.
- **New fake/sample data** (for tests or the public demo): goes in
  `data/sample/`, committed normally. **Naming footgun to avoid:** don't name a
  sample file `soccer*.xlsx` — the repo's `.gitignore` blanket-excludes that
  pattern to keep real spreadsheets out, and it'll silently swallow a fake file
  with the same prefix too (this happened once already; the sample workbook is
  named `sample_season.xlsx` specifically to dodge it).

## Adding the future live-report parser

When the Claude API key is available and report parsing gets built, its job is
narrowly scoped by this contract: read a report email thread (see the
thread-reading rules in `kaiser_BUILD_SPEC.md` — full thread, not just the root
message, corrections in replies supersede the original), resolve every name via
`resolvePlayerName()`, and emit one `GameRecord`. Everything after that —
rollup, leaderboards, rankings, the UI — already exists and doesn't need to
change, because it was built against this contract rather than against
whatever shape the spreadsheets happened to have.
