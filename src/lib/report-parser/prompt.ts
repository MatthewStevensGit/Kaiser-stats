/**
 * The extraction prompt, encoding the report-parsing rules from
 * kaiser_BUILD_SPEC.md directly — this is the one place those rules
 * actually get enforced at parse time, so keep it in sync with that doc.
 */
export function buildExtractionPrompt(threadText: string): string {
  return `You are extracting structured data from a youth/adult pickup soccer league report email thread called "Kaiser". Follow these rules exactly:

1. Read the ENTIRE thread below, not just the first message. Replies routinely correct the original report (a wrong scorer, a wrong assist, an own-goal miscredit). A correction stated in a reply SUPERSEDES the original message's claim for that specific fact.
2. Goals: extract every goal with its scorer and, only if explicitly stated, who assisted it. Do not guess an assist that isn't stated — leave assistRaw null.
3. MVP: only extract an MVP if the ORIGINAL report message (the first message in the thread, from the organizer) itself states it as fact. Other participants' opinions stated in REPLIES (e.g. "that was an MVP performance by X") are NOT a source for mvpRaw — leave it null unless the original message itself names an MVP. In practice the organizer rarely states one explicitly; null is a normal, expected answer.
4. Team rosters: these reports commonly open with a plain list of everyone who played, split into two clearly delimited groups presented in sequence — e.g. two blocks of comma-separated names separated by a blank line, sometimes under a header like "N people." When you see this structure, it IS a clear statement of both rosters (reading a list, not guessing a split): the FIRST group listed is the home roster, the SECOND group listed is the away roster. Only if the report has no such clearly delimited two-group listing at all (e.g. only a narrative paragraph naming a few players in passing) should you leave homeRosterRaw/awayRosterRaw as empty arrays rather than guessing a split.
5. Team labels: "home"/"away" is purely an internal bookkeeping distinction for this pickup league — it has no real meaning (no fixed home field). Only extract homeTeamLabelRaw/awayTeamLabelRaw if the report itself explicitly names each side (e.g. "Team Orange", "Team Blue," or similar) — same first-group/second-group convention as team rosters (rule 4): whichever side is named first is homeTeamLabelRaw. If the report never names the sides at all, leave both null rather than inventing a label.
7. Notable mentions: capture any standout narrative language about a specific player's performance (e.g. "X was dominant on both ends" or "Y went through 4-5 players"), even for a player who didn't score — this is exactly the kind of qualitative signal that a pure goal-count would miss. Quote the relevant snippet verbatim.
8. Use the raw name exactly as written in the text (e.g. "Sasha SI", not a normalized or guessed full name). Do not attempt to resolve who a name "really" refers to — that happens in a separate step.
9. If the final score isn't clearly stated, leave homeScore/awayScore null rather than guessing.
10. If you are not confident about a field, leave it null / empty rather than guessing. It is always better to leave something out than to state something uncertain as fact.

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
  "notableMentions": [{ "playerRaw": string, "quote": string }]
}

--- THREAD START ---
${threadText}
--- THREAD END ---`;
}
