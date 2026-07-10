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
  status text not null check (status in ('regular', 'guest', 'deferred', 'example'))
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
