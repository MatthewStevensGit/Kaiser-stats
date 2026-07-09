# Kaiser Check-In App — Step 1 Concept

**What it replaces:** the current process where players email the organizer to confirm, the organizer manually builds and re-emails the list, and cancellations/adjustments happen ad hoc by email.

**What it does NOT do yet:** stats, MVP, goal tracking, power rankings, synergy analysis. That's Step 2, built on top of data this app starts collecting (rosters, teams, attendance) plus the post-game reports.

Two leagues from day one: Saturday Kaiser and Sunday Kaiser, run as separate instances of the same system (separate rosters, deadlines, organizer/admin, captains) but same codebase.

---

## Roles

- **Player** — checks in, gets drafted, plays.
- **Captain** — two players per game, designated *by the admin each week* (assumption: this mirrors how it works today — admin picks/knows who's captaining), run the live draft.
- **Admin** (the organizer, e.g. Vadim for Sunday) — sets the deadline, manages the cutoff, has manual override power over who's in at any time, resolves regular/non-regular disputes.

## Weekly flow

1. **Check-in window opens.** Admin (or a fixed schedule — open item) starts the window for that week's game.
2. **Players check in** before the deadline. Each check-in records timestamp + player identity.
3. **At deadline, default staging applies.** Target is 24. The system auto-stages the first 24 check-ins (by timestamp) as default-admitted and the rest as default-waitlisted. This is just a starting point, not a rule — the admin can flip any individual's status at any time, in either direction, regardless of check-in order.
   - No automated "regular" formula. The app tracks each player's attendance history (total games all-time + per year), computed from logged check-ins, and surfaces it on the admin panel as reference data. The admit/deny decision itself stays 100% manual — the admin can weigh attendance however he wants, but the system never enforces it. This avoids the same circularity problem raised earlier with using draft position to rank performance.
   - Every manual override is logged: who denied/admitted whom, when. Cheap to build now, and the first time someone asks "why wasn't I let in," the admin has a record instead of relying on memory.
4. **Admin can override at any time** — admit, deny, or swap people, before or after the deadline. This is always a manual action, never automatic.
   - *Requires:* whoever's status changes needs to actually find out. MVP notification plan: email (free, we already have everyone's address from the CC lists) with an in-app status the player can check. Push notifications are a nicer experience but add real setup complexity — flagged as a Step 1.5/Step 2 upgrade, not a launch blocker.
5. **Live draft.** The two captains alternate snake-style picks from the confirmed pool, inside the app, in real time (both see picks land immediately). Final team assignments are saved.
   - This is the most technically involved piece of Step 1 — it's a small real-time feature (shared live state between two users), not just a form.
6. **Post-deadline cancellations** go through the admin, not self-service. A player who needs to drop after the deadline flags it; admin decides whether/how to backfill.
7. **Guests.** Not everyone who plays is on the email/CC list — a regular can bring a friend who's never been invited or created an account. Guests are not full accounts in Step 1: a regular checks in and optionally attaches a guest ("+1: bringing Steve"), which counts toward the 24-cap like any other spot. Guests have no login. Matching the same guest across multiple weeks (is this week's "Steve" the same as three weeks ago?) is best-effort at most — there's no email to anchor identity, so this is an accepted limitation, not something to over-build a solution for.

## Data this app needs to store (Step 1 minimum)

- Player: id, name, known aliases/nicknames, known emails
- League: Saturday / Sunday, target headcount, admin/owner
- Game instance: date, league, deadline, status
- Check-in: player, game, timestamp, status (checked in / admitted / waitlisted / denied), computed from timestamp ordering + any manual admin override
- Admin action log: game, player, action (admit/deny), admin, timestamp — the audit trail behind every override
- Team assignment: game, player, team, pick number (this pick-order data is what Step 2's stats will consume — worth capturing cleanly now even though we're not analyzing it yet)
- Attendance (derived, not stored separately): count of games checked-in-and-admitted per player, all-time and per calendar year, computed from check-in records

## Tech stack (default, since Matt deferred the choice)

- **Frontend:** Next.js PWA (installable, "add to home screen," works on phone browsers — no App Store, no $99/yr fee).
- **Hosting:** Vercel free tier.
- **Database + auth + realtime:** Supabase free tier (Postgres). Supabase's realtime subscriptions are the specific reason it's picked over alternatives — they're the natural fit for the live snake-draft feature (both captains need to see picks land instantly), which is the single most technically involved piece of Step 1.
- **Notifications:** email via a free-tier transactional email service (e.g. Resend) — matches the MVP notification plan above (we already have everyone's email from the CC lists).
- **Step 2 (stats parsing):** Claude API, pay-as-you-go — not literally free, but cheap at this volume. Requires Matt to provide an API key when Step 2 starts; not needed for Step 1.

## Resolved: admin permissions and backfill scope

- **Admin must be a role/grant in the data model, not a hardcoded single user.** Eduard getting admin access is deferred, not needed at launch — but the permission system needs to support adding a second admin later as a data change (grant a role to an account), not a code change. Build it this way from the start even though only Vadim is admin on day one.
- **Attendance/goals/games backfill scope is finalized at the 4 years of spreadsheets already collected (2022–2026).** No need to push further back — matches roughly when Vadim started bringing younger (under-20) players into the league, so earlier history is less relevant to who's actually playing now anyway.

## Resolved: captains and deadline

- **Captains are picked fresh each week by the admin**, not a fixed rotation.
- **Deadline is fixed** (a consistent weekly time), not set manually per game.
- **New detail from a real report:** captains do a coin-toss/choice step before the draft — "Alik gave me the first choice" (Vadim, June 13 report) — confirming there's a "who picks first" decision the app should capture alongside the draft itself, not just team assignments.

## Open items to confirm before build starts

1. **The owner conversation hasn't happened yet.** This is the actual blocker — not discussed above because it's not a design question, it's a prerequisite. Nothing here matters if he doesn't adopt it as the real process.
2. **Cold-start attendance gap — resolved, backfill it.** Decision: for closed/final seasons (2022–2025), backfill attendance/goals/games directly from Vadim's existing year-end spreadsheets (fast, structured, already validated — see `kaiser_stats_engine_notes.md`). For the current in-progress season (2026), his spreadsheet is stale as of the last snapshot (March 29, 2026) — everything since then needs parsing from report emails, not the spreadsheet. Note the "ask the owner for his account/full email history" step is a bigger trust ask than just cooperating on data access, and realistically rides on the same buy-in conversation as adopting the app itself (item 1) — not a separate lightweight favor.
