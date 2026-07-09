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
- `src/app/` — a minimal Next.js page rendering the engine's output against
  the fake sample dataset.
- Not yet built: LLM-based report-email parsing (needs a Claude API key,
  see `kaiser_BUILD_SPEC.md`), the admin-editable per-game review screen, and
  Phase 2 (the check-in app — blocked on the owner conversation).

## Running it

```
npm install
npm test        # stats-engine unit tests
npm run dev      # demo page at localhost:3000
```

`data/sample/` holds a small fake/anonymized dataset (`players.json` +
`sample_season.xlsx`, regenerated via `scripts/generate-sample-data.mjs`) so
the engine and demo page run without any real data present.

## Privacy

Real player names, emails, and attendance/stats data never get committed
here. They're gitignored and, if present, live only in a local `private/`
folder — see `kaiser_github_setup.md` for the full policy and
`kaiser_BUILD_SPEC.md` for the project design.
