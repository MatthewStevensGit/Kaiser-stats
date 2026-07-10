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

## Not yet automated

This is a manual, one-file-at-a-time script — there's no automatic pipeline
that watches for new report emails and runs this on its own, and no write
path into Supabase yet (it only prints the result). Both are reasonable next
steps once the extraction quality itself has been checked against a few real
reports.
