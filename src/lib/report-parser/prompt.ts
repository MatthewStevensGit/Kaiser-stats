/**
 * The extraction prompt, encoding the report-parsing rules from
 * kaiser_BUILD_SPEC.md directly — this is the one place those rules
 * actually get enforced at parse time, so keep it in sync with that doc.
 */
export function buildExtractionPrompt(threadText: string): string {
  return `You are extracting structured data from a youth/adult pickup soccer league report email thread called "Kaiser". Follow these rules exactly:

1. Read the ENTIRE thread below, not just the first message. Replies routinely correct the original report (a wrong scorer, a wrong assist, an own-goal miscredit). A correction stated in a reply SUPERSEDES the original message's claim for that specific fact.
2. Goals: extract every goal with its scorer. For the assist, either the literal word "assist" being used, OR a clear narrative pass-then-goal sequence naming both players (e.g. "Elan found Nicholas who put it through" — Elan assisted Nicholas; "X played in Y who scored" — X assisted Y) counts as stating an assist — this is reading what the sentence says, not guessing. If the text only names a scorer with no such stated or clearly narrated setup, leave assistRaw null rather than inventing one.
3. MVP: mvpRaw is only ever an ADVISORY narrative signal — the actual MVP decision is a deterministic stats calculation done later in code (goals + assists, see computeMvp() in src/lib/stats-engine/goal-summary.ts), not yours to decide outright. Just report whoever the ORIGINAL report message's own narrative specifically calls out with standout qualitative language (e.g. "was the deciding factor," "unbelievable in net," "made many good stops and preserved our lead," "their most dangerous player all game") — this is only ever used as a tiebreaker between statistically-tied players, or as a fallback on the rare game with no extracted goals/assists at all. Other participants' opinions stated in REPLIES (e.g. "that was an MVP performance by X") are never a source. If no one is specifically called out, leave mvpRaw null — that's a normal, expected answer, not a failure to find one.
4. Team rosters: these reports commonly open with a plain list of everyone who played, split into two clearly delimited groups presented in sequence — e.g. two blocks of comma-separated names separated by a blank line, sometimes under a header like "N people." When you see this structure, it IS a clear statement of both rosters (reading a list, not guessing a split): the FIRST group listed is the home roster, the SECOND group listed is the away roster. Only if the report has no such clearly delimited two-group listing at all (e.g. only a narrative paragraph naming a few players in passing) should you leave homeRosterRaw/awayRosterRaw as empty arrays rather than guessing a split.
5. Team labels: "home"/"away" is purely an internal bookkeeping distinction for this pickup league — it has no real meaning (no fixed home field). Only extract homeTeamLabelRaw/awayTeamLabelRaw if the report itself explicitly names each side (e.g. "Team Orange", "Team Blue," or similar) — same first-group/second-group convention as team rosters (rule 4): whichever side is named first is homeTeamLabelRaw. If the report never names the sides at all, leave both null rather than inventing a label.
6. Notable mentions: capture any standout narrative language about a specific player's performance (e.g. "X was dominant on both ends" or "Y went through 4-5 players"), even for a player who didn't score — this is exactly the kind of qualitative signal that a pure goal-count would miss. Quote the relevant snippet verbatim.
7. Use the raw name exactly as written in the text (e.g. "Sasha SI", not a normalized or guessed full name). Do not attempt to resolve who a name "really" refers to — that happens in a separate step.
8. If the final score isn't clearly stated, leave homeScore/awayScore null rather than guessing.
9. If you are not confident about a field, leave it null / empty rather than guessing. It is always better to leave something out than to state something uncertain as fact.
10. Draft order: within each team's roster from rule 4's "N people" blank-line-separated listing, the first-listed player is that team's captain (the one who did the picking), and the rest of that team's list is already in the order they were drafted — this needs no separate extraction downstream (confirmed league convention for THAT listing format specifically; a report that instead names both sides up front, e.g. "Team Orange:"/"Team Blue:", is just listing who played, not draft order — see rule 5). Separately, a report sometimes ALSO narrates, in prose, the exact pick-by-pick order the two captains alternated in (e.g. "Vadim and Alik are captains, Nick Brazil selected first, then it was Alan, then Josh, then it was Emre and Matthew, then it was Oleg"). When you see this kind of explicit picked-in-this-order narrative — naming each captain's picks in sequence, not just who played — extract pickOrderRaw as an ordered array reflecting that exact sequence: each entry is a single name (one pick that turn), or an array of names when the text explicitly says multiple were picked together in the same turn (e.g. "then it was Emre and Matthew" -> ["Emre", "Matthew"]). Never include the two captains themselves in this list. If the report doesn't narrate an explicit pick order like this, leave pickOrderRaw null rather than inventing one from who merely played or scored.

Respond with ONLY a JSON object matching this exact shape, no other text:
{
  "date": "YYYY-MM-DD or null",
  "league": "saturday" | "sunday" | "unknown",
  "homeRosterRaw": string[],
  "awayRosterRaw": string[],
  "homeTeamLabelRaw": string or null,
  "awayTeamLabelRaw": string or null,
  "homeScore": number or null,
  "awayScore": number or null,
  "goals": [{ "scorerRaw": string, "assistRaw": string or null, "team": "home" | "away" | "unknown" }],
  "mvpRaw": string or null,
  "notableMentions": [{ "playerRaw": string, "quote": string }],
  "pickOrderRaw": (string | string[])[] or null
}

--- THREAD START ---
${threadText}
--- THREAD END ---`;
}
