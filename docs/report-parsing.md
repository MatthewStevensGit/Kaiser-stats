# Report parsing

Turns a Kaiser report email's text into a `GameRecord` (goals, assists, MVP,
notable mentions) via the Gemini API. Local/private tooling, same spirit as
the Supabase backfill — nothing here is wired into the deployed site.

## How it works

1. `src/lib/report-parser/prompt.ts` builds an extraction prompt encoding the
   report-parsing rules from `kaiser_BUILD_SPEC.md` directly (read the full
   thread, corrections in replies supersede the original, MVP only from the
   organizer's own original message, never guess when uncertain).
2. `src/lib/report-parser/gemini-client.ts` sends it to Gemini and gets back
   raw-name-string JSON (a `RawExtraction`) — the model never resolves who a
   name "really" is, that's not its job.
3. `src/lib/report-parser/parse-report.ts`'s `resolveExtractionToGameRecord()`
   runs every extracted name through the exact same `resolvePlayerName()` /
   `createProvisionalIdentity()` code the spreadsheet backfill uses — a name
   close to a different existing player gets flagged for a human, a
   genuinely novel name gets auto-tracked, exactly like `npm run backfill`.
   It also re-validates goals against the stated score itself (never trusts
   the model's own say-so) — see `goalSumMismatch` in the output.

## Setup

Requires `GEMINI_API_KEY` in `.env.local` (get one free at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) — no
payment method needed for this project's usage scale).

## Running it

```
npm run parse-report -- path/to/report.txt
```

The input is a plain `.txt` file containing the report thread's text — every
message in the thread, in order, ideally with something marking where one
message ends and the next begins (e.g. paste each message separated by a
blank line, with the sender noted). Save real report text under `private/`
(gitignored, same as everything else with real player data — never commit
it) — e.g. `private/sample-reports/2026-07-05-sunday.txt`.

Output: the extracted `GameRecord` as JSON, the goal-sum check result, and
lists of auto-tracked new players / flagged names needing a decision — same
shape and same philosophy as `npm run backfill:preview`.

## Draft position (computed by default, per game)

Confirmed league convention (2026-07-16): the first-listed player in each
team's roster is that team's captain, and the rest of that side's list is
already in the order they were drafted. By default, `resolveExtractionToGameRecord()`
assumes the team listed first (home) picked first, alternating strict snake
order (`2*i+1`/`2*i+2`) from both rosters' listed order — this runs
automatically for every report-parsed game, no annotation needed. See
`docs/data-contract.md`'s draft-position section and the doc comment on
`resolveExtractionToGameRecord` in `src/lib/report-parser/parse-report.ts`
for the full reasoning (this supersedes an earlier, more conservative
"never guess draft order" stance from before this convention was confirmed).

Two ways to override the default for a specific game:

- **A human-supplied fact**: if you know the away team's captain actually
  picked first (contradicting the default), add one line anywhere in that
  game's `.txt` file before running the parser:

  ```
  First pick: Ari Fox
  ```

  This is read directly by our own code before the text ever reaches
  Gemini — never inferred by the model. If the name doesn't match either
  roster's first-listed player, you'll get a `firstPickWarning` instead and
  pick numbers are left null entirely for that game (something's
  inconsistent enough not to trust).

- **A narrated pick order in the report itself**: some reports describe the
  actual pick-by-pick order in prose (e.g. "Vadim and Alik are captains,
  Nick Brazil selected first, then Alan, then Josh, then Emre and Matthew,
  then Oleg"). When Gemini recognizes this pattern (see `prompt.ts` rule 10),
  it extracts an ordered `pickOrderRaw` list — including simultaneous
  ties (two names picked in the same turn) — which overrides the default
  for every pick after the two captains. If a named player can't be matched
  to either roster, you get a `pickOrderWarning` and the rest of the order
  is still applied.

## Admin web UI (the real write path)

`/matches/import` (admin-only, linked from `/matches`'s header) wraps this same
parsing/resolution code in a two-step browser flow instead of a CLI file: paste the
report text, click **Parse** to see a review-before-you-trust-it preview (rosters,
goals, MVP, notable mentions, `goalSumMismatch`/`firstPickWarning` banners, and the
flagged-name / auto-tracked-new-player lists), then click **Save to database** to
actually write it. See `src/lib/report-parser/actions.ts`
(`previewReportImport`/`saveReportImport`) and `src/lib/report-parser/persist.ts` (the
pure `GameRecord` → Supabase row mapper, unit-tested in `persist.test.ts`). Saving a
`game_id` that already exists (same date + league) returns a friendly error rather than
overwriting — there's no edit/delete path yet, same as the CLI script below.

## Bulk historical backfill

```
npm run backfill-reports -- [directory]
```

Defaults to `private/sample-reports/` if no directory is given. Parses every `.txt` file
there through the same parser/resolution/write path as `/matches/import` (via
`src/lib/report-parser/save.ts`'s `saveResolvedGame()`, shared by both), instead of
pasting each report into the browser by hand — for getting a backlog of old Vadim emails
in all at once. Each file's `game_id`/`source` comes from its filename (same convention
as `npm run parse-report`), and known players (including ones auto-tracked earlier in the
same run) accumulate across files so a name seen in file 3 that's already been
auto-tracked from file 1 doesn't get logged as newly-tracked all over again. Safe to
re-run: a file whose game already exists is skipped, not duplicated.

## Not yet automated

`npm run parse-report` (the single-file version above) remains useful for a quick local
preview without touching Supabase at all — handy for sanity-checking extraction quality
against one report before trusting a whole batch to `backfill-reports`. There's still no
automatic pipeline that watches for new report emails and runs this on its own.
