# Kaiser Stats Engine — Design Notes (Step 2, running doc)

Running log of decisions made while scoping stats/analysis. Feeds into the eventual spec handed to Claude Code — kept separate from `kaiser_step1_concept.md` since Step 1 (check-in app) and Step 2 (stats) are being built as separate phases.

## Identity / name resolution for stats

- **Primary key = the name string as written in the report**, not email/account. Vadim (and presumably the Saturday reporter) is ~99% consistent with in-report naming on purpose — the whole point of a report is that the group can follow who's playing, so trusting report-name-as-identity by default is reasonable, not just an assumption of convenience.
- Known duplicate first names are already disambiguated by the reporter himself (e.g. "Sasha SL" vs "Sasha Ru") — trust his disambiguation, don't try to re-derive it independently.
- New spelling variants of an existing name (typos, one letter off) get **flagged via fuzzy match against the known name list, never auto-merged silently.** Short names (3-5 letters) are riskier for this — a one-letter difference can be a genuinely different person (Leo/Neo, Alan/Alen), not just a typo — so fuzzy matches are suggestions for human confirmation, not automatic merges.
- Currently the only confirmed multi-spelling case is Matt G. himself (Matthiew/Matthew/Mathew). Not enough data yet to treat that as a general pattern for other names.

## Leagues

- Vadim owns and reports both Saturday and Sunday Kaiser.
- A player is one identity shared across leagues — league participation is many-to-many (some people play both), not a fixed attribute per player. `kaiser_player_identity.csv` currently hardcodes league=sunday per row since that's all we've seen; needs restructuring to a leagues-played list once Saturday data comes in.

## Stats output

- Three views: Saturday-only, Sunday-only, and merged (both combined).

## MVP

- Never explicitly named in any report seen so far (confirmed). Treated as a stat the app computes/infers from the narrative — an "app's own MVP call," not extraction of something Vadim stated as fact. Needs to be presented that way to users too, not disguised as objective.

## Goals / assists

- Not explicitly labeled in report text — "X scored," implied assists like "Joe was right there and put it in" after someone else's shot. Requires LLM-level reading of the prose, not regex/keyword extraction.

## CONFIRMED from real Gmail data (pulled 2026-07-08)

- **Reports are threads, not single emails, and replies routinely correct the original.** The 7/5 Sunday thread has 3 messages: Vadim's report, then a reply from a teammate (Boris) correcting the 2nd goal ("it was own goal by Sandrik, not Joe"), then a reply from Eduard Perelman correcting an assist ("first goal by Johny was off my assist not Matt's") AND explicitly naming an MVP: "Hands down... an MVP performance in goal by Vadim!" This changes the design: **parsing must read the full thread, not just the root message**, and corrections from replies should generally supersede the original report's claims — but both versions should be logged (audit trail), not silently overwritten, in case a later reply disputes the correction too.
- **RESOLVED — MVP source is Vadim's initial report only.** Other participants' reply-thread MVP opinions (e.g. "Hands down... an MVP performance in goal by Vadim!") are explicitly disregarded as a source. The app computes its own MVP claim from Vadim's report text alone — not adopting anyone's stated human opinion, including Vadim's own if he ever states one directly. Open question not yet confirmed: do goal/assist *factual* corrections from replies (own-goal fix, wrong-assist fix) still get incorporated for accuracy, since that's a different thing than "whose opinion counts as MVP" — leaning yes, but needs explicit confirmation, not assumed.
- Correct spelling is **"Johny"** (one h), not "Johhny" — corrected by a reply in the same thread. Still unresolved which player this actually is.
- Many-message threads are common, not rare — sampled threads had 1-5 messages each.

## DECIDED (revised): goals are ground truth, assists tracked but never used in rankings

Reversed the earlier "cut assists entirely" call after discussing the admin-editable game screen (below) — assists ARE tracked (auto-parsed when explicit, or added by the admin while reviewing the report), but **excluded from any computed ranking (MVP, power ranking, synergy)**, while goals ARE used.

Reasoning, confirmed against the June 13 prototype: goals are complete and verifiable — every goal in that report was narrated and the totals summed exactly to the final score. Assists are not — they only appear when Vadim happens to narrate the buildup to a goal ("off Oleg's pass"), which is optional color, not a guaranteed field. Using assist count as a ranking input would systematically penalize a player who set up goals that simply weren't narrated in detail that week, in favor of one whose single assist got a sentence. That's a coverage artifact, not a real signal — so assists live as their own honest counting stat (a "bonus leaderboard," same spirit as goals-per-game but explicitly caveated as reporter-dependent), never as an input to MVP or power rankings. This caveat applies to any future use of assists in the original "who's better together" / power-ranking idea from the start of the project too.

**Admin-editable game screen (new UI element for Step 2):** a per-game tab showing the parsed report text alongside the roster, where the admin can tap to add/adjust a goal (and optionally an attached assist) per player — closing exactly the gaps the auto-parser correctly leaves blank rather than guessed. This is the human-in-the-loop mechanism that makes tracking assists viable despite their inconsistent narration: a person who was probably at the game can fill a 30-second gap the parser correctly declined to guess.

**Resolved for the June 13 prototype specifically:** Gary credited for both of his goals (including the ambiguous "opened the scoring on a rebound" one — scorer isn't ambiguous, only the assist source is, and per Matt's call that assist isn't worth chasing), Max credited for his one goal from the "exchanged goals late" line, no assist recorded for either — consistent with the "don't guess, leave blank" rule.

## PROTOTYPE RESULT: parsing feasibility — validated on a real report

Tested by hand-simulating the parser on the "Saturday, June 13" report (thread `19ec3dade29a9b3b`), then cross-checking every claim against arithmetic and against the separate sign-up thread for the same date. Result: **feasible, with explicit rules for what NOT to guess.**

Full extraction achieved: final score 5–2, correctly attributed every goal to a team and scorer (Gary ×2, Matthew ×3 — a hat trick — for the winning team; Kirill ×1, Max ×1 for the other), and the arithmetic checked out exactly against the stated final score (5=2+3, 2=1+1) — a good automatic sanity check to build into the real parser (if goals-by-scorer don't sum to the stated score, flag for review instead of trusting the parse). One assist was explicit ("Kirill redirected... off Oleg's pass/shot") and got credited; two goals were scored off unclear/rebound situations ("on a rebound," "exchanged the goals late") with no assist stated — correctly left as "no assist credited" rather than guessed. Also surfaced a real MVP-relevant case a goals-only stat would completely miss: "Nick Brazil is absolutely dominant on both ends of the field... went through 4-5 players" — a standout performance with zero goals, exactly the kind of thing narrative-based MVP scoring needs to catch and pure stat-counting would ignore.

Also confirmed: the roster in this report ("20 people," including both "Matt" and "Matthew" on the same team) matches exactly what the separate sign-up thread for the same date produced (18 confirmed + "Adding Matthew and Edik" = 20) — cross-thread consistency holds, and **the Matt/Matthew collision resolves correctly even when both play the same game**, because Vadim does write both distinct spellings side by side when both are actually present.

**Bonus finding from the sign-up thread itself (not the report):** "DO NOT reply all" is sometimes broken in practice — this Sunday, June 28 sign-up thread has visible back-and-forth between Matt and Vadim resolving a live nickname mixup ("Jonik" → assumed to be "Isaac" → corrected to "Jonathan"), taking 6 messages to resolve. This is a real, current example of exactly the confusion the check-in app is meant to eliminate — worth keeping as a concrete "before" example when pitching the owner. Also confirms the "Looking for Nth... Adding X" mechanic described early in this project plays out exactly as described, live in the data.

**Bonus finding on captains:** "Alik gave me the first choice which turned out to be a mistake" (Vadim, in the same June 13 report) confirms a coin-toss-style "who picks first" mechanic between the week's two captains, decided before the draft — worth folding into the draft-capture design in `kaiser_step1_concept.md`.

## Gap handling — two edge cases confirmed by Matt

- Very rarely, Vadim doesn't send the report — Eduard Perelman does instead. Any gap-detection pass over the archive needs to also check Eduard before concluding a week is genuinely missing, not just search "from:vadim."
- Very rarely, a game is cancelled outright ("not enough people") — believed to have happened Saturday, July 4, 2026. Checked that thread directly (`19f27dfd0afa8d88`): it's actually the pre-game invite, not a cancellation or report — "Please let me know before 5pm if you are planning to come to Kaiser tomorrow. First 22 regulars will play. DO NOT reply all." Two new facts from this: **Saturday's cap is 22 regulars, not 24** (Sunday's cap, confirmed earlier, is 24 — caps differ by league, don't assume they match) — and the "DO NOT reply all" instruction explains why individual sign-up confirmations don't show up in these group-visible threads at all: people reply privately/directly to Vadim, so that data is invisible to a "from:vadim" search by design. Haven't yet located the actual July 4 cancellation email — would need a broader search (from:vadim OR from:eduard.perelman, or a keyword search for cancellation language) to find it. Flagged as a known gap rather than chased down immediately, given how much ground this session already covered.
- Design implication: "no game held" needs to be its own status in the data model, distinct from "report missing" — a cancelled week shouldn't count as a gap in anyone's attendance streak the same way a genuinely unlogged week would.

## CONFIRMED: Vadim's actual spreadsheet system, read directly (2022–2026, 5 files)

Matt uploaded the real xlsx files. Here's what's actually in them, not guessed:

**Core categories tracked every year:** GAMES (attendance), WINS, LOSSES, TIES, GOALS, and a derived PLUS/MINUS column. Confirmed by arithmetic across multiple rows: **PLUS/MINUS = WINS − LOSSES** (e.g. Boris Def 2022: 41W − 18L = 23, matches exactly). It's not a goal differential — a keeper with 1 personal goal can still have a high plus/minus. Cheap to derive, not an independent data source.

**The ranking formula has changed at least twice and isn't stable — don't treat any one of them as "the" official metric.** 2022–2023 sorted primarily by PERCENT (win rate) with a POINTS column (= 2×wins + 1×tie, standard soccer scoring). 2024 and 2026 dropped PERCENT/POINTS entirely and sorted by PLUS/MINUS instead. 2025 brought percent back as a *second, parallel* sheet alongside plus/minus — and the two metrics disagree on who's #1 (Gera is 7th by plus/minus but 1st by percent in 2025). This is useful ammunition against over-claiming objectivity for whatever power-ranking formula we build — even Vadim's own multi-year practice shows there's no single correct answer, just different lenses.

**Standard sheet set per year:** main standings, a games-played/attendance leaderboard (this is the exact attendance data the check-in app's cold-start problem needs — Vadim: 87-89 games/year, plays almost every week), a goals-only leaderboard, and a goals-per-game rate leaderboard. The rate leaderboard has **no minimum-games floor** — a guy with 1 game and 2 goals ranks above a guy with 41 games and 1.4/game. Real methodology weakness in his system, and a cheap, obvious improvement for ours (apply a games-played threshold before ranking by rate).

**Assists are never tracked, in any of the 5 years.** Muchnik's joking 2023 email plea ("I need a title for assists!!!!!!") went unanswered — confirmed absent from every sheet checked. This is a real gap the community has already asked to be filled and Vadim's spreadsheet system never has. Directly validates assists as a stat this app can add that genuinely doesn't exist anywhere else yet.

**Guest labeling convention confirmed in the data itself:** 2022 Sheet2 has an entry literally named "Alex(Maxim friend)" — a parenthetical "(X's friend)" suffix used to mark a guest. Gives us an actual textual pattern to detect guests in historical data, not just a hypothesis.

**Name-collision resolution cross-validated by the spreadsheets themselves:** "Matthew" (28 goals, 2024; 35 goals, 2023) and "Matt" (26 goals, 2025) appear as separate tracked entries across multiple years — consistent with the earlier resolution (Matt = Matthew Rakov, Matthew/Matthiew/Mathew = Matt Ginzburg). Vadim's own system already treats them as different people.

**Data hygiene caveat:** the files aren't a clean database — duplicate/near-duplicate sheets within the same workbook (2023's Sheet1 and Sheet2 share identical rows for some players), inconsistent column sets year to year, at least one fully blank sheet in most years, and the 2026 mid-season snapshot has 3 of its 5 sheets completely empty (only populated at year-end, not mid-season, despite the "3 months in" email framing). If we ever ingest these files programmatically, each year needs its own parsing logic — there's no fixed schema across all of them.

## Archive scope — much bigger than assumed

Full index pull (`kaiser_email_index.csv`) found **1,001 threads from Vadim, spanning 2022-09-09 to 2026-07-05** — the earlier "201" figure was a stale Gmail estimate. Breakdown: Saturday 456, Sunday 408, Monday 43, Thursday 8, Friday 7, Wednesday 3, Tuesday 3, OTHER 73. Games happen on more days than Sat/Sun/Fri/Mon — holiday one-offs show up on Tue/Wed/Thu too (Thanksgiving, Christmas, New Year's, MLK Day). Per the merged-view decision above, all of these count toward the main stats; only Saturday/Sunday get their own secondary breakdown.

**CONFIRMED: Vadim runs a full formal league system already, with real spreadsheets, going back to at least 2022.** Read the 2023 "final results" thread directly. Every year-end email includes an attached Excel file (e.g. `soccer 2023.xlsx`) with 5 sheets: (1) final results/standings, (2) final results using "our old % system" (a legacy win-percentage-based ranking — implies the ranking system itself has changed at least once before), (3) goals, (4) goals per game, (5) games (played count). He declares a season winner ("Congratulation to Max on winning the league!") and a scoring champion ("Congratulations to Alik on his annual scoring title!"). A mid-season version also exists ("Soccer Stats 2026 after 3 months," attachment `soccer 2026 (1).xlsx`), so this isn't just year-end — he tracks running standings throughout. One reply asked, half-joking, for an assist-specific award title, confirming assists matter to the group too even though goals/games/standings are the only sheets confirmed so far.

**Action needed:** the Gmail tools available here (search_threads, get_message, get_thread, labels, drafts) don't include an attachment-download call, so I can't open these xlsx files directly. Worth having Matt pull one or two recent ones (the 2026 mid-season one and a recent full-year one) and share them — this is the actual ground truth for what stats/formula/ranking system the group already values, and doubles as a validation benchmark for whatever this app computes.

**Big find inside the "OTHER" bucket: Vadim already computes and sends his own season stats.** Subjects like "2022 Final Stats," "Soccer Stats 2026 after 3 months," "Soccer stats - Year 2024," "Our soccer league winners!," and "Trophy ceremony" suggest an existing self-tracked competitive structure (seasons, standings, declared winners) that predates this project entirely. Worth reading a few of these before building anything — they're a free look at his own stats methodology and a validation benchmark for whatever the app computes, and raise a real question: does this app aim to replace/formalize his existing informal standings, or run as a separate independent system alongside them? If the two ever disagree (e.g. app's power ranking vs. his declared season winner), that's a credibility problem worth avoiding by deciding the relationship up front.

## RESOLVED: stats views

Subject-line survey shows Vadim also runs Friday and Monday "Kaiser" games, not just Saturday/Sunday. Decision: **the merged view is the main/primary stats output and includes every game regardless of day** (Fri/Sat/Sun/Mon/whatever else turns up) — this is what most people will look at, and what powers the "who's actually the best" rankings. Saturday-only and Sunday-only views are kept as secondary breakdowns; Friday/Monday games are not getting their own dedicated per-day view, they just roll into the merged one.

