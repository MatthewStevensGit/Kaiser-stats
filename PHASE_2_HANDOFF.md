# Phase 2 Handoff — read this first

You're a fresh Claude Code session with no memory of how this repo got here.
This doc is written for you specifically: what exists, why it exists, how to
touch it, and what's next. Read this before anything else, including
`kaiser_BUILD_SPEC.md` (still the original design doc, but this file has the
current, ground-truth state).

## What this project is

A stats tracker for a recurring pickup soccer league ("Kaiser") run by an
organizer named Vadim, being built as a portfolio project by the repo owner
(Matt Ginzburg — not a player in the league in the "regular" sense, but a
participant and project owner). Full original vision: `kaiser_BUILD_SPEC.md`.

Two phases, always kept separate:
- **Phase 1 (stats engine)** — DONE, live, described below. Backfills
  historical results, parses live report emails for goals/assists/MVP,
  computes standings and rankings.
- **Phase 2 (check-in app)** — NOT STARTED. See "Phase 2" section below for
  why and what it needs.

## Phase 1 status: complete and live

- **Live site:** `kaiser-stats.vercel.app`. Auto-deploys from `main` via a
  GitHub↔Vercel integration already connected. **Shows only fake sample data**
  (`data/sample/`) — this is deliberate, not a bug, see "Privacy model" below.
- **Repo:** `MatthewStevensGit/Kaiser-stats` on GitHub. 11 commits on `main`
  as of this handoff, all delivered as squash-merged PRs (see "Git workflow"
  below for a real gotcha this caused repeatedly).
- **Local dev machine:** the repo owner's own Windows PC, cloned at
  `C:\Users\matth\Documents\Kaiser-stats`, using PowerShell. Node, npm, and
  git are already installed and working there. **Real credentials only exist
  on that machine's `.env.local`** — not in this repo (gitignored), not
  necessarily in whatever sandbox you're running in.
- **Tests:** 26 passing (`npm test`). Also clean: `npx tsc --noEmit`,
  `npx eslint .`, `npx next build`.

### What actually works right now

1. **Historical spreadsheet backfill** — `src/lib/stats-engine/` parses the
   real `soccer_*.xlsx` files (2022–2026, 14 files, in `private/` on the
   local machine, never committed) into season standings. Real run already
   done once: 903 rows, 0 plus/minus arithmetic mismatches, 26 seeded known
   players, 80 auto-tracked new players, 89 flagged names still needing a
   human to confirm (see `unresolved_names_log` table in Supabase).
2. **Identity resolution** (`src/lib/stats-engine/identity.ts`) — the core
   discipline of this whole codebase, read this before changing anything
   name-related: a name close to a *different* existing player gets
   **flagged** (real misattribution risk, needs a human), a name with *no*
   match to anything gets **auto-provisioned** a stable placeholder identity
   (no risk, so no need to block on a human). Never silently merged either
   way. See `docs/data-contract.md`'s "Identity resolution" section.
3. **Supabase backfill** (`scripts/backfill-to-supabase.ts`,
   `npm run backfill`) — writes the real data above into a private Supabase
   Postgres database. `npm run backfill:preview` is the same thing read-only.
4. **Report parsing** (`src/lib/report-parser/`, `npm run parse-report --
   path/to/report.txt`) — turns a report email's text into a `GameRecord`
   (goals/assists/MVP/notable mentions) via the Gemini API. Built, unit
   tested, **never yet run against a real report end-to-end** — that's the
   natural next Phase-1-adjacent task if anyone picks it up, not blocking
   Phase 2.
5. **Demo site UI** (`src/app/`) — `/` (leaderboards, power ranking,
   MVP/assists, notable mentions, data-quality flags) and `/rules` (how
   scoring works, on-field rules verbatim from Vadim). All against fake data.

## Infrastructure map

### GitHub
- Repo: `MatthewStevensGit/Kaiser-stats`.
- Feature branch used throughout Phase 1: `claude/kaiser-setup-phase-1-fcoeu7`.
  **Gotcha:** every PR was squash-merged, which means `main`'s squash commit
  is never a literal ancestor of the feature branch's pre-squash commits.
  Starting new work, always do:
  ```
  git fetch origin main
  git checkout -B <your-branch-name> origin/main
  ```
  before committing anything new — this discards nothing (working tree
  changes survive the reset) but keeps history clean and avoids non-fast-
  forward push errors. Push with `--force-with-lease`, not a plain
  `--force`.
- Workflow used for every change: implement → `tsc`/`eslint`/`vitest`/
  `next build` all clean → commit → push → open PR → squash-merge. Was not
  asked to skip PRs; kept using them throughout.

### Vercel
- Linked to the GitHub repo, auto-deploys `main`.
- **No environment variables configured.** This is intentional — no code
  under `src/app/` imports Supabase or the report parser, so there is
  currently no code path in the deployed app that could serve real data even
  by accident. Going live with real data is a deliberate future decision
  (build a page that queries Supabase + explicitly add env vars to Vercel),
  not a default to slide into.

### Supabase
- Project name: "kaiser-stats" (created under a "Kaiser" project on the
  owner's Google-linked account). Project ref: `kuvhierdbksgsjlvckdf` (i.e.
  URL `https://kuvhierdbksgsjlvckdf.supabase.co`).
- Schema: `supabase/schema.sql` — 7 tables (`players`,
  `season_standing_rows`, `game_records`, `roster_spots`, `goal_events`,
  `notable_mentions`, `unresolved_names_log`), already applied to the real
  project via the SQL Editor.
- **Every table has Row Level Security enabled with NO public policies** —
  the anon/public key can read nothing. Only the `service_role` (legacy) key
  can read/write, used exclusively by local scripts, never client-side.
  Note Supabase has two parallel key systems now — this project uses the
  **Legacy anon/service_role** tab's `service_role` key, not the newer
  `sb_secret_...` key format (the newer format is not what
  `@supabase/supabase-js`'s legacy-key-shaped calls in this codebase expect
  — if a fresh key ever needs generating, grab it from the Legacy tab).
- Credentials live only in `.env.local` on the owner's local machine.
  **This sandbox cannot reach Supabase's network** — outbound requests to
  `*.supabase.co` get a `403 policy denial` from this environment's proxy.
  Any Supabase-touching script must be run by the human, locally, not by you
  directly, unless your own sandbox's egress policy is confirmed different.
- Explicitly NOT linked to Vercel (the "enable integration" prompt Supabase
  offers was deliberately declined) — see Vercel section above for why.

### Gemini API
- Free tier, no payment method attached. Project created via
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey), named
  "Kaiser-stats" under a "Kaiser" Google Cloud project (auto-created, no
  manual linking needed).
- **Why Gemini and not Claude**, despite `kaiser_BUILD_SPEC.md` naming
  Claude: cost. The owner's Anthropic Console account had $0 credit
  (evaluation-tier account, no billing attached) and didn't want to add
  billing; Gemini's free tier (1,500 req/day on Flash models) comfortably
  covers this project's real usage (a handful of report emails per week) at
  $0. Documented in `docs/report-parsing.md` and noted inline in
  `kaiser_BUILD_SPEC.md`.
- Credentials: `.env.local` on the local machine only, key `GEMINI_API_KEY`.

## Key files map

```
src/lib/stats-engine/       Core engine: identity resolution, spreadsheet
                             parsing, aggregation, power rankings. The
                             single source of truth for how stats are
                             computed — both ingestion paths converge here
                             (see docs/data-contract.md).
src/lib/report-parser/      Gemini-based report email -> GameRecord.
src/lib/supabase/client.ts  Service-role Supabase client. Server/script-only,
                             never imported by src/app/.
src/app/                    The public Next.js site (demo data only).
scripts/                    All local/private tooling — backfill, preview,
                             report parsing, sample-data generation.
supabase/schema.sql         The real DB schema (already applied).
data/sample/                Fake/anonymized dataset the public demo runs on.
private/                    Real data. Gitignored. Only exists on the local
                             machine. New files go in private/incoming/.
docs/data-contract.md       THE reference for the PlayerSeasonStats /
                             GameRecord shapes and identity-resolution rules.
                             Read this before changing engine logic.
docs/supabase-setup.md      How the Supabase project was set up + how to
                             run the backfill.
docs/report-parsing.md      How the report parser works + how to run it,
                             including the optional "First pick" annotation
                             for real (human-confirmed, per-game-only) draft
                             position data.
kaiser_BUILD_SPEC.md        Original design doc (now with an inline note
                             about the Gemini swap).
kaiser_step1_concept.md     Full Phase 2 spec — roles, weekly flow, draft,
                             guest handling, admin permissions.
kaiser_owner_ask_list.md    The batched list of things to confirm with
                             Vadim before Phase 2 starts.
kaiser_stats_engine_notes.md  Research trail from real Gmail data pulled
                             earlier in the project (real names/emails
                             redacted before commit — see git history if
                             curious how that was handled).
```

## Rules that must never be broken

1. **Never commit real player data.** Names, emails, attendance/stats tied
   to real people stay in `private/` (gitignored) or Supabase (RLS-locked),
   never in git, never in a public-facing page without a deliberate,
   explicit decision (see "Going live with real data" in
   `docs/data-contract.md`).
2. **Never guess an identity merge.** A fuzzy name match against a
   *different* existing player is always flagged for a human, never
   auto-merged — this is the single most important invariant in the
   codebase. See `docs/data-contract.md`.
3. **Never guess draft position.** `pickNumber` is `null` by default for
   report-parsed games; a human can supply a real, per-game "First pick"
   fact, but a standing assumption/pattern must never be coded in — it would
   silently corrupt the power-ranking disparity badge with no way to audit
   which numbers are real vs. assumed.
4. **Never trust the LLM for identity resolution.** The Gemini report parser
   only ever extracts raw name strings; resolving who a name "really" is
   always runs through the same deterministic `resolvePlayerName()` /
   `createProvisionalIdentity()` code as the spreadsheet path.
5. **Validate goals against the stated score in code, not by trusting the
   model.** See `goalSumMismatch` — flag for review, don't guess.
6. **Every non-trivial change ships through the tsc/eslint/vitest/build gate
   and an actual PR**, not just committed straight to main.

## A real operational lesson worth inheriting

The owner's Windows machine has security/DLP software that **silently
corrupts pasted secrets** in some contexts (clipboard content matching
credential-like patterns gets altered without any visible error). This
caused repeated, confusing debugging across the Supabase and Gemini key
setup. What actually worked reliably: verify file contents by **length**
(`(Get-Content .env.local)[N].Length`) rather than displaying secrets, and
when local paste is unreliable, build the file in this session and hand it
back as a downloadable file instead of asking for a paste. Don't assume a
credential is correct just because it was typed/pasted successfully —
verify with a real API call before building on top of it.

## Open items (not blockers, just known gaps)

- 89 flagged names in `unresolved_names_log` still need a human to confirm
  (or reject) a merge — growing `kaiser_player_identity.csv` is real,
  ongoing follow-up work, not a one-time task.
- The report parser has real unit-test coverage but has never been run
  against an actual report email end-to-end — worth doing before trusting
  its output on real data at scale.
- Real data has never been exposed on the live site — first time that
  happens should be a deliberate conversation, not an accident.

## Phase 2: what's next, and the actual blocker

**Do not start writing Phase 2 code without checking with the user first.**
The original spec is explicit about this, and nothing has changed it: Phase
2 (the check-in app replacing Vadim's email-based weekly sign-up) should not
be built until the owner conversation with Vadim happens — whether he'll
actually adopt this as his real process. Full batched ask: `kaiser_owner_ask_list.md`.
If the user tells you that conversation has happened and Vadim is in,
proceed; if unclear, ask before building.

Full Phase 2 spec: `kaiser_step1_concept.md`. Headline pieces once unblocked:
- Roles: Player / Captain / Admin.
- Weekly check-in window, default first-N-by-timestamp staging, admin manual
  override always wins, every override logged.
- **Live snake draft** — the most technically involved piece, needs
  Supabase's realtime feature (already the reason Supabase was chosen over
  alternatives).
- Guest handling (name attached to inviting regular, no login).
- Admin permission model as a data-model role grant from day one, not a
  hardcoded single user (so a second admin, e.g. Eduard, can be added later
  without a code change).
- Attendance backfill for the cold-start problem: already solved by Phase 1's
  spreadsheet backfill.

## How to get productive immediately

1. Confirm with the user: has the Vadim conversation happened? If not, ask
   whether to proceed anyway or hold.
2. `git fetch origin main && git checkout -B <new-branch> origin/main`.
3. Read `docs/data-contract.md` and `kaiser_step1_concept.md` in full before
   writing code.
4. If you need real credentials (Supabase/Gemini), ask the user — they exist
   only on their local machine's `.env.local`, not in this repo, and this
   sandbox likely can't reach Supabase's network directly (see above).
5. Same verification gate as always before shipping: `npx tsc --noEmit`,
   `npx eslint .`, `npm test`, `npx next build`, then PR + squash-merge.
