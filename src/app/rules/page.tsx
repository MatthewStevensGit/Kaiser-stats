const SCORING_ROWS = [
  { stat: "GAMES", meaning: "Games played" },
  { stat: "WINS / LOSSES / TIES", meaning: "Result of each game played" },
  { stat: "GOALS", meaning: "Goals scored, ground truth — validated against the reported final score" },
  { stat: "PLUS/MINUS", meaning: "WINS − LOSSES. A cheap derived stat, not an independent measure." },
  {
    stat: "POINTS (legacy)",
    meaning: "2 × WINS + 1 × TIES — the scoring formula Vadim's spreadsheets used in 2022–2023",
  },
  {
    stat: "PERCENT (legacy)",
    meaning: "WINS ÷ (WINS + LOSSES + TIES) — win rate, used in 2022–2023 and again alongside plus-minus in 2025",
  },
];

export default function RulesPage() {
  return (
    <main>
      <header className="page-header">
        <a href="/" className="back-link">
          ← Back to stats
        </a>
        <h1>Kaiser Rulebook</h1>
        <p className="subtitle">
          How games are organized and how the stats on this site get computed. Where we
          don't have Vadim's actual rules yet, it's marked as a placeholder rather than
          guessed.
        </p>
      </header>

      <section className="card">
        <h2>What's tracked</h2>
        <ul className="icon-list">
          <li>
            <span className="icon" aria-hidden="true">
              ⚽
            </span>
            <div>
              <strong>Goals</strong>
              <p className="note">
                Ground truth. Every scorer&apos;s total must sum to the reported final
                score, or the parse gets flagged for review instead of trusted.
              </p>
            </div>
          </li>
          <li>
            <span className="icon" aria-hidden="true">
              🎯
            </span>
            <div>
              <strong>Assists</strong>
              <p className="note">
                Tracked as their own counting stat, but never used in MVP or the power
                ranking — they only get mentioned when the report happens to narrate the
                buildup, so using them in a ranking would penalize good play that just
                didn&apos;t get a sentence that week.
              </p>
            </div>
          </li>
          <li>
            <span className="icon" aria-hidden="true">
              🏆
            </span>
            <div>
              <strong>MVP</strong>
              <p className="note">
                Computed by the app from the report&apos;s narrative (goals plus
                standout-performance language) — presented as the app&apos;s own derived
                call, never as a fact Vadim stated. Other players&apos; MVP opinions
                posted in reply threads are not used as a source.
              </p>
            </div>
          </li>
          <li>
            <span className="icon" aria-hidden="true">
              📊
            </span>
            <div>
              <strong>Power ranking</strong>
              <p className="note">
                Plus-minus per game, with a minimum-games floor so small sample sizes
                can&apos;t dominate. Formula is disclosed on the standings page, not
                claimed as objective — Vadim&apos;s own ranking formula has changed more
                than once. Average snake-draft pick position is shown alongside it for
                context (like fantasy sports&apos; performance-vs-ADP) — never a ranking
                input, since it encodes the captains&apos; priors, not performance.
              </p>
            </div>
          </li>
          <li>
            <span className="icon" aria-hidden="true">
              💬
            </span>
            <div>
              <strong>Notable mentions</strong>
              <p className="note">
                Verbatim report-narrative snippets naming a player (e.g. a standout
                zero-goal performance), shown as qualitative context next to the power
                ranking — never scored or folded into MVP or the ranking itself. Same
                reasoning as assists: coverage is too sparse and inconsistent (a mention
                only exists if a report happens to narrate that moment) to use as a fair
                ranking input.
              </p>
            </div>
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>How a game day works</h2>
        <ul>
          <li>
            Two leagues, run separately: Saturday (cap 22 regulars) and Sunday (cap 24
            regulars), plus occasional Friday/Monday and holiday games that roll into the
            Merged view.
          </li>
          <li>
            Two captains are picked fresh each week. A coin-toss/choice step decides who
            picks first, then teams are set by a snake draft.
          </li>
          <li>
            Guests are allowed — a regular can bring someone with no account. Guests are
            tracked as a name attached to the inviting regular; matching the same guest
            across multiple weeks is best-effort only.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Standings &amp; scoring</h2>
        <p className="note">
          Column meanings, taken directly from the historical spreadsheets this site
          backfills from.
        </p>
        <div className="table-scroll">
          <table className="table-prose">
            <thead>
              <tr>
                <th>Stat</th>
                <th>What it means</th>
              </tr>
            </thead>
            <tbody>
              {SCORING_ROWS.map((row) => (
                <tr key={row.stat}>
                  <td>
                    <strong>{row.stat}</strong>
                  </td>
                  <td>{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          There&apos;s no single &quot;official&quot; ranking formula across every year — Vadim&apos;s
          own system sorted by PERCENT in 2022–2023, switched to PLUS/MINUS in 2024 and
          2026, and tracked both in parallel in 2025 (where they disagreed on who was
          #1). This site is transparent about which formula it uses rather than claiming
          one is definitively correct.
        </p>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Worked example</h3>
        <p className="note">
          Using the site&apos;s fake sample players, not real games:
        </p>
        <p>
          Final score 3–1. Ari Fox scores twice, Bex Tanaka scores once off an assist
          from Cy Okafor.
        </p>
        <ul>
          <li>Goals: Ari Fox +2, Bex Tanaka +1 — sums to 3, matches the reported score.</li>
          <li>Assists: Cy Okafor +1 — a standalone stat, doesn&apos;t affect MVP or ranking.</li>
          <li>
            MVP: decided by the app from the report&apos;s language, not just the goal
            count — a zero-goal standout performance can still win it.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>On-field game rules</h2>
        <p className="note">
          From Vadim&apos;s &quot;Rule clarifications&quot; email, verbatim — including
          his own terms (e.g. &quot;pervaja&quot;), not rephrased.
        </p>
        <blockquote className="rule-quote">
          On a free kick when attacking player is counting the steps for the wall, the
          defending team cannot intentionally impede him doing it (if they do, it&apos;s a
          yellow card, pervaja). The player who is counting must count 3 steps, he cannot
          count 1, come back and shoot. If he does that, the free kick is voided and the
          ball is given to the defending team. If the ball hits a player in the wall and
          his hands are &quot;connected&quot; to the body, it&apos;s not a hand ball, but
          if the hands are outside the body, it&apos;s a hand ball. Bottom line, put your
          hands on the body when you are in the wall.
        </blockquote>
        <p className="note">
          This is the full on-field rules content collected so far — not necessarily
          exhaustive of every house rule Vadim enforces informally. More gets added here
          as more of the archive is read.
        </p>
      </section>
    </main>
  );
}
