# GitHub Setup Walkthrough — Kaiser Project

For someone who's never created a repo before. Do this before opening Claude Code.

## 1. Create the GitHub account (if you don't have one)

Go to github.com, sign up with your email. Free tier covers everything here — public repos are free and unlimited.

## 2. Create the repository

1. Click the "+" in the top right → "New repository."
2. Name it something like `kaiser-stats` (repo names can't have spaces — use hyphens).
3. Set it to **Public** (you said you want this on GitHub publicly / resume-visible) — but see the privacy note below before pushing any real data.
4. Check "Add a README file."
5. Add a `.gitignore` — choose the "Node" template from the dropdown (matches the Next.js stack) — this pre-fills common junk files (node_modules, build output, .env files) to ignore.
6. License: MIT is the standard permissive default for a portfolio project — means anyone can use/copy the code, but you keep credit. Optional, but expected on public repos people might actually look at.
7. Click "Create repository."

## 3. Critical: what NOT to put in this repo

This is the public/private split decided earlier — worth restating because it's easy to get wrong once real data is flowing:

- **Never commit real names, real emails, or real attendance/stats data tied to identifiable people.** The `.gitignore` needs entries for wherever that data lives (e.g. a `/data/private/` folder, or just never check in the actual `kaiser_player_identity.csv` with real emails filled in).
- **Never commit API keys or secrets** (Claude API key, Supabase keys, etc.) — these go in environment variables (`.env.local`), which the Node `.gitignore` template already excludes by default. Double-check this before your first push, don't just trust the template blindly.
- The repo should contain: the app code, the schema/structure, a README explaining the project, and a small **fake/anonymized sample dataset** (a few made-up players and games) so anyone looking at the repo (recruiters, other devs) can see it work without exposing real people's data.

## 4. Connect Claude Code to the repo

1. Install Claude Code if you haven't: follow instructions at the official Claude Code docs.
2. Clone the repo to your machine: `git clone https://github.com/<your-username>/kaiser-stats.git`
3. `cd kaiser-stats`
4. Run `claude` (or however Claude Code launches in your setup) inside that folder — it now has repo context.
5. Feed it the spec/prompt-pack document (coming next) as your first real instruction.

## 5. Basic git workflow you'll actually use

- `git add .` — stage changes
- `git commit -m "short description of what changed"` — save a checkpoint
- `git push` — send it to GitHub
- Claude Code can run these for you when you ask it to commit/push — you don't need to memorize the commands, just know what they do.

## 6. Resume-friendliness notes

- A clean, descriptive README with a screenshot/GIF of the app once it exists matters more for resume purposes than repo size or line count.
- Commit history tells a story — frequent, descriptive commits look more like real engineering than one giant initial commit. Worth doing this incrementally as Claude Code builds, not as one dump at the end.
