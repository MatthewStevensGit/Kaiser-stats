-- Kaiser Stats — Supabase schema
--
-- Stores the *inputs* to the existing TypeScript stats engine
-- (src/lib/stats-engine/), not a re-implementation of it. Tables mirror
-- SeasonStandingRow / GameRecord / PlayerIdentity from types.ts closely on
-- purpose, so a query layer can fetch rows and feed them straight through
-- aggregateStandings() / rollupGameRecords() — the aggregation logic itself
-- has exactly one implementation, in TypeScript, already tested. See
-- docs/data-contract.md.
--
-- PRIVACY: every table here can hold real player names/emails and real
-- attendance/stats data. Row Level Security is enabled on all of them with
-- NO public policies — nothing is readable via the anon/public API. Only the
-- service_role key (server-side only, e.g. the backfill script; never
-- NEXT_PUBLIC_-prefixed, never sent to a browser) can read or write. Adding
-- any public SELECT policy here is a decision to make deliberately later,
-- not a default.

create table if not exists players (
  canonical_id text primary key,
  display_name text not null,
  aliases text[] not null default '{}',
  known_emails text[] not null default '{}',
  leagues text[] not null default '{}',
  -- 'provisional' included alongside the identity-resolution statuses (see
  -- createProvisionalIdentity()/createProvisionalIdentityFromEmail() in
  -- src/lib/stats-engine/identity.ts) — both the name-ingestion path and the
  -- login path auto-provision under this status rather than blocking.
  status text not null check (status in ('regular', 'guest', 'deferred', 'example', 'provisional')),
  -- Links this player to their Supabase Auth identity, set on first login
  -- (see src/app/auth/callback/route.ts). Most rows (backfilled from
  -- spreadsheets) will never log in and stay null.
  auth_user_id uuid unique references auth.users (id),
  -- Deliberately a single flag, not the fuller Player/Captain/Admin role
  -- model from kaiser_step1_concept.md — that's still deferred.
  is_admin boolean not null default false
);

alter table players enable row level security;

-- One row per (player, source-sheet) — the normalized output of
-- parseSeasonStandingsSheet(), before name resolution. Mirrors
-- SeasonStandingRow exactly.
create table if not exists season_standing_rows (
  id bigint generated always as identity primary key,
  source text not null,
  league text not null check (league in ('saturday', 'sunday', 'unknown')),
  player_name_raw text not null,
  -- Set once resolvePlayerName() finds an exact match; left null for a
  -- flagged/unresolved name rather than guessed — see unresolved_names_log.
  player_canonical_id text references players (canonical_id),
  games integer not null,
  wins integer not null,
  losses integer not null,
  ties integer not null,
  goals integer,
  plus_minus integer,
  percent numeric,
  points numeric
);

alter table season_standing_rows enable row level security;
create index if not exists season_standing_rows_player_idx on season_standing_rows (player_canonical_id);

-- Mirrors GameRecord. Populated by the future LLM report-parser; the
-- backfill script only ever writes season_standing_rows (spreadsheets never
-- had per-game granularity — see docs/data-contract.md), so this stays empty
-- until report parsing exists.
create table if not exists game_records (
  game_id text primary key,
  date date not null,
  league text not null check (league in ('saturday', 'sunday', 'unknown')),
  home_score integer not null,
  away_score integer not null,
  mvp_canonical_id text references players (canonical_id),
  -- Admin-pasted free-text summary of the game (originally lifted from the
  -- league organizer's report message). No admin-editing UI exists yet.
  description text,
  source text not null
);

alter table game_records enable row level security;

create table if not exists roster_spots (
  id bigint generated always as identity primary key,
  game_id text not null references game_records (game_id) on delete cascade,
  canonical_id text not null references players (canonical_id),
  side text not null check (side in ('home', 'away')),
  pick_number integer not null
);

alter table roster_spots enable row level security;
create index if not exists roster_spots_game_idx on roster_spots (game_id);
create index if not exists roster_spots_player_idx on roster_spots (canonical_id);

create table if not exists goal_events (
  id bigint generated always as identity primary key,
  game_id text not null references game_records (game_id) on delete cascade,
  scorer_canonical_id text not null references players (canonical_id),
  assist_canonical_id text references players (canonical_id),
  team text not null check (team in ('home', 'away'))
);

alter table goal_events enable row level security;
create index if not exists goal_events_game_idx on goal_events (game_id);

create table if not exists notable_mentions (
  id bigint generated always as identity primary key,
  game_id text not null references game_records (game_id) on delete cascade,
  canonical_id text not null references players (canonical_id),
  quote text not null
);

alter table notable_mentions enable row level security;
create index if not exists notable_mentions_game_idx on notable_mentions (game_id);

-- Every name resolvePlayerName() couldn't exactly-match during a backfill
-- run — flagged or fully unresolved, mirrors NameResolution. Never
-- auto-merged; this is the durable "needs a human" queue (see
-- kaiser_BUILD_SPEC.md's identity-resolution rules and
-- kaiser_owner_ask_list.md's identity-confirmation batch).
create table if not exists unresolved_names_log (
  id bigint generated always as identity primary key,
  raw_name text not null,
  status text not null check (status in ('flagged', 'unresolved')),
  candidate_canonical_id text references players (canonical_id),
  candidate_distance integer,
  source text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_canonical_id text references players (canonical_id)
);

alter table unresolved_names_log enable row level security;

-- Migration (2026-07-14): auth support for email/magic-link login.
-- Run this once in the Supabase SQL Editor against the existing project —
-- the players table already exists there, so the CREATE TABLE above won't
-- apply these changes retroactively. No new RLS policy is added anywhere:
-- the login flow only ever touches Supabase's own auth.users table from the
-- browser (via the anon key) and only ever touches players server-side via
-- the service_role key (src/lib/supabase/client.ts) — the "RLS enabled, zero
-- public policies" invariant on every table here stays exactly as-is.

-- 1. Fix a latent bug: PlayerIdentity.status (src/lib/stats-engine/types.ts)
--    has included "provisional" since the identity-resolution work, but this
--    CHECK constraint never did. Auto-provisioned login identities need to
--    insert with status='provisional', which would violate this constraint
--    as written today.
--    Verify the actual constraint name first — it should be the
--    Postgres-default "players_status_check" for a table created via the
--    unnamed inline CHECK in this file, but confirm before dropping:
--      select conname from pg_constraint
--      where conrelid = 'players'::regclass and contype = 'c';
alter table players drop constraint players_status_check;
alter table players add constraint players_status_check
  check (status in ('regular', 'guest', 'deferred', 'example', 'provisional'));

-- 2. Link a players row to its Supabase Auth identity. Nullable + unique:
--    most existing rows (backfilled from spreadsheets) will never log in and
--    have no auth account; at most one player row per auth user.
alter table players add column if not exists auth_user_id uuid unique references auth.users (id);

-- 3. Simplest possible admin flag. Deliberately not the fuller
--    Player/Captain/Admin role model from kaiser_step1_concept.md — that's
--    explicitly deferred until/unless a live draft feature is built.
alter table players add column if not exists is_admin boolean not null default false;
