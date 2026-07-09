# Kaiser Project — Build Spec (start here for Claude Code)

Portfolio project: a stats/analysis tool (and eventually a check-in app) for a weekly pickup soccer game called "Kaiser," run by an organizer named Vadim across multiple leagues (Saturday, Sunday, occasional Friday/Monday/holiday games). Goal: ship something real on GitHub, learn Claude Code, build toward more ambitious future projects.

**Build order: Phase 1 (stats engine) first — no external dependencies. Phase 2 (check-in app) only once the owner conversation resolves — see "Not blockers" at the bottom for why.**

Supporting docs in this folder (reference, don't duplicate): `kaiser_stats_engine_notes.md` (full research trail), `kaiser_step1_concept.md` (Phase 2 spec), `kaiser_player_identity.csv` (seed identity table), `kaiser_email_index.csv` (1,001-thread index of Vadim's Kaiser emails, 2022–2026), `kaiser_github_setup.md` (repo setup), `kaiser_owner_ask_list.md` (batched ask for the owner conversation).

## Tech stack

Next.js PWA (installable, phone-browser-first, no App Store) → Vercel (free hosting) → Supabase free tier (Postgres, auth, and specifically realtime — needed for Phase 2's live draft) → Resend or similar for email notifications (free tier) → Claude API for report parsing (pay-as-you-go, requires an API key from Matt before Phase 1's parsing step can run live — everything else in Phase 1 can be built/tested against the historical spreadsheet data without it).

## Phase 1: Stats Engine

### Data sources (already collected)

1. **Historical spreadsheets, 2022–2025 (closed seasons) + partial 2026** — the ground-truth backfill source for goals/games/W-L-T for closed years. Structure varies year to year (see `kaiser_stats_engine_notes.md` for the full breakdown) — don't assume one fixed schema across files.
2. **2026 is NOT fully covered by its spreadsheet** — Vadim's last snapshot was March 29, 2026. Everything from that date forward must come from parsing report emails, not the spreadsheet.
3. **Email archive index** (`kaiser_email_index.csv`) — 1,001 threads, classified by day (Saturday/Sunday/Friday/Monday/etc./OTHER). Use this to locate report threads programmatically; don't re-run the full Gmail pull.
4. Historical backfill scope is capped at 2022 — do not attempt to go further back.

### Player identity

- Canonical player table: id, display name, known aliases (nicknames as they appear in reports/rosters), known emails (a person can have more than one — confirmed real case: Alexander Gart), league participation as many-to-many (a player is one identity across leagues, not per-league).
- Report text is the primary key for stats attribution (not email) — Vadim is consistently disciplined about disambiguating duplicate first names in-report (e.g. "Sasha SI" vs "Sasha Ru"), so trust the written name as-is.
- New spelling variants get fuzzy-matched against the known list and **flagged for human confirmation, never auto-merged** — short names are especially risky (Leo/Neo, Alan/Alen could be different real people).
- Guests: no account, no login. Captured as a name attached to the inviting regular's check-in/mention. Cross-week identity matching for guests is best-effort only. Detection pattern seen in the wild: `"Name(X's friend)"` parenthetical suffix.
- Known resolved cases: "Matt" = Matthew Rakov; "Matthiew"/"Matthew"/"Mathew" = Matt Ginzburg (project owner) — these are two different people and both spellings are used consistently even in games where both play.
- Known unresolved case: "Johny" (one h) — scored in the July 5, 2026 Sunday report, doesn't match either team roster verbatim. Leave as an unresolved-player placeholder rather than guessing; batch into the owner ask list.

### Report parsing rules

- **Read the full email thread, not just the root message.** Replies routinely correct the original report (confirmed real examples: an own-goal miscredit fixed in a reply, an assist misattribution fixed in a reply).
- **Corrections in replies supersede the original stated fact** — but log both versions, don't silently overwrite, in case a correction itself gets disputed later.
- **MVP opinions stated by other players in replies are disregarded as a source.** MVP is a stat the app computes itself from Vadim's original report text only — never adopts a human's stated opinion, including Vadim's own if he ever states one directly (confirmed: he never does — narrative only).
- **Goals are ground truth, and must be 100% accurate.** Every goal in every tested report was narrated and per-scorer totals summed exactly to the stated final score — build this as a validation check: if scorer totals don't sum to the stated score, flag the parse for admin review instead of trusting it.
- **Assists are tracked but never used in computed rankings** (MVP, power rankings, synergy). Reasoning: assists only appear when the report happens to narrate the buildup to a goal — that's inconsistent coverage, not a reliable signal, and using it in a ranking would penalize players whose good buildup play just didn't get a sentence that week. Assists are a standalone, honestly-caveated counting stat only.
- **Admin-editable per-game screen**: shows the parsed report text and roster together; admin can add/adjust a goal (and optionally attach an assist to it) per player. This is the human-in-the-loop mechanism for closing gaps the auto-parser correctly declines to guess.

### Stats views

Three: Saturday-only, Sunday-only, and Merged. **Merged is the primary/default view and includes every game regardless of day** (Friday, Monday, and occasional Tuesday/Wednesday/Thursday holiday games all roll into Merged only — they don't get their own dedicated per-day view).

### MVP

Computed by the app from report narrative — goals plus qualitative signals (standout performance language, e.g. a real example found: "dominant on both ends of the field" for a zero-goal player). Never assists (see above). Must be presented in the UI as the app's own derived call, not as a stated fact.

### Power rankings / "who's better together" (synergy)

This was the original motivating idea for the whole stats side. Two hard constraints from research:

- **Don't use snake-draft pick order as a direct ranking input** — it encodes the two captains' subjective priors, not objective performance, and feeding it back into a "performance" ranking is circular. If used at all, frame as "performance relative to draft position" (like fantasy sports' value-over-ADP), not a direct input.
- **Don't use assists as an input** (coverage bias, as above).
- Vadim's own system changed its primary ranking formula more than once (win-percentage-based, then plus/minus-based, and 2025 tracks both in parallel where they *disagree* on who's #1) — there is no single "correct" historical formula to match. Pick one, be transparent about the formula, don't claim objectivity it doesn't have.
- `PLUS/MINUS` in his data = `WINS − LOSSES`, confirmed by direct arithmetic — cheap derived stat, not independent data.
- Apply a minimum-games threshold before ranking any per-game rate stat (his goals-per-game leaderboard has no floor and lets 1-game sample sizes dominate — an easy, obvious improvement).

## Phase 2: Check-In App

Fully specced separately in `kaiser_step1_concept.md` — roles, weekly flow, cutoff/regulars logic (admin-judgment based, not formula-based), guest handling, live snake-draft capture, admin permission model (role-based from day one so a second admin can be added later without code changes). Do not start this until the owner conversation (see below) resolves.

## GitHub / repo handling

Full walkthrough in `kaiser_github_setup.md`. Key constraint for Claude Code: **never commit real names, emails, or identifiable stats data — build against a small fake/anonymized sample dataset checked into the repo, keep real data in gitignored files/env vars.**

## Not blockers for starting Phase 1 code (but tracked)

- Owner buy-in conversation — blocks Phase 2 only, not Phase 1. Full batched ask in `kaiser_owner_ask_list.md`.
- "Johny" identity — proceed with an unresolved-player placeholder.
- Deeper email history access from the owner — optional extension to backfill, not required to start.
