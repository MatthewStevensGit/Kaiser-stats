# Supabase setup (real-data backfill)

This is a **local/private** setup — it stores real player data (names,
possibly emails, real attendance/stats) in a database, not in this repo. The
live site at `kaiser-stats.vercel.app` does not use any of this and keeps
showing the fake sample dataset until that's deliberately changed (see
"Going live with real data" in [`data-contract.md`](data-contract.md)).

## 1. Create the project

1. Go to [supabase.com](https://supabase.com), sign up / log in.
2. "New project" → pick an organization (create one if this is your first
   project) → name it something like `kaiser-stats` → set a database
   password (save it somewhere — you likely won't need it day-to-day, Supabase
   uses API keys for normal access, but it's how you'd connect a raw Postgres
   client later) → pick a region close to you → free tier is fine.
3. Wait a minute or two for it to finish provisioning.

## 2. Apply the schema

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. Open [`supabase/schema.sql`](../supabase/schema.sql) from this repo, copy
   its full contents, paste into a new query, and run it.
3. Check **Table Editor** — you should see `players`, `season_standing_rows`,
   `game_records`, `roster_spots`, `goal_events`, `notable_mentions`, and
   `unresolved_names_log`.

Every table has Row Level Security enabled with no public policies — nothing
is readable through the API except with the service_role key (below). That's
intentional; see the comment block at the top of `schema.sql`.

## 3. Get your API credentials

1. In the dashboard, go to **Settings → API**.
2. Copy the **Project URL**.
3. Copy the **`service_role` key** — not the `anon`/`public` one. The
   service_role key bypasses Row Level Security, which is exactly why it must
   never end up in browser-shipped code (never prefix it `NEXT_PUBLIC_`) or in
   this repo.

## 4. Configure locally

```
cp .env.example .env.local
```

Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
That file is gitignored — it never gets committed.

## 5. Preview, then backfill

```
npm run backfill:preview   # read-only — reports coverage, writes nothing
npm run backfill           # writes players + season_standing_rows to Supabase
```

`backfill:preview` parses every real `.xlsx` under `private/` and
`private/incoming/` and reports row counts, plus/minus arithmetic mismatches,
and identity-resolution outcomes — run this first to see how much of the
identity table (`private/kaiser_player_identity.csv`) actually covers the
historical spreadsheets before writing anything.

Names fall into two buckets (see `docs/data-contract.md`'s "Identity
resolution" section for the full reasoning):
- **Auto-tracked new players** — no fuzzy match to anything, no
  misattribution risk, so `npm run backfill` gives them a stable placeholder
  identity and counts their stats immediately. No action needed unless/until
  you want to attach their real name.
- **Flagged** — close to a *different* existing player (e.g. "Gera" vs.
  "Gena"). These are genuinely ambiguous and need a human decision before
  they're counted — logged to the `unresolved_names_log` table in Supabase.

As of this writing, against the real 2022–2026 spreadsheets: 80 unique new
players get auto-tracked, and 89 row-occurrences are flagged as ambiguous and
still need review.

`npm run backfill` is safe to re-run: each source file's rows are replaced,
not duplicated.
