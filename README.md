# Kaiser-stats

LLM-powered stats tracker for a recurring pickup soccer league.

Portfolio project. Planning docs are checked in at the repo root
(`kaiser_BUILD_SPEC.md` is the entry point). **No real player data lives in
this repo** — see the Privacy section below.

## Status: Phase 1 (stats engine) in progress

- `src/lib/stats-engine/` — core engine: player identity resolution (never
  auto-merges a fuzzy name match), a header-based parser for the historical
  season-standings spreadsheets (column layouts vary year to year), per-player
  aggregation across Saturday/Sunday/Merged views, a plus-minus sanity check,
  and a transparent, disclosed power-ranking formula with a minimum-games
  floor.
- `src/app/` — a Next.js demo (`/`) rendering the engine's output against a
  fake sample dataset, plus a `/rules` page explaining how the stats are
  computed.
- See [`docs/data-contract.md`](docs/data-contract.md) for the stable data
  shapes (`PlayerSeasonStats`, `GameRecord`) both the spreadsheet backfill and
  the future live-report parser are expected to converge on, and for where new
  raw data files should go.
- Not yet built: LLM-based report-email parsing (needs a Claude API key,
  see `kaiser_BUILD_SPEC.md`), the admin-editable per-game review screen, and
  Phase 2 (the check-in app — blocked on the owner conversation).

## Running it

```
npm install
npm test        # stats-engine unit tests
npm run dev      # demo page at localhost:3000
```

`data/sample/` holds a small fake/anonymized dataset (`players.json`,
`sample_season.xlsx`, `games.json`) so the engine and demo page run without any
real data present. The spreadsheet regenerates via
`scripts/generate-sample-data.mjs`.

## Privacy

Real player names, emails, and attendance/stats data never get committed
here. They're gitignored and, if present, live only in a local `private/`
folder (new raw files go in `private/incoming/`, see
[`docs/data-contract.md`](docs/data-contract.md)) — see `kaiser_BUILD_SPEC.md`
for the full project design and privacy policy.
