import { aggregateStandings, rankByRate } from "@/lib/stats-engine/aggregate";
import { listPlayers, listSeasonStandingRows } from "@/lib/stats-engine/data";
import { formatPlusMinus, formatWDL } from "@/lib/format";
import { PillTabs } from "./_components/PillTabs";

const GOLDEN_BOOT_MIN_GAMES = 3;

type TableTab = "plus-minus" | "golden-boot";

function isTableTab(value: string | undefined): value is TableTab {
  return value === "plus-minus" || value === "golden-boot";
}

function plusMinusClass(value: number): string {
  if (value > 0) return "value-positive";
  if (value < 0) return "value-negative";
  return "value-neutral";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: TableTab = isTableTab(rawTab) ? rawTab : "plus-minus";

  // Merged only, for now — Saturday/Sunday split may return in a later slice.
  const [players, rows] = await Promise.all([listPlayers(), listSeasonStandingRows()]);
  const { players: totals } = aggregateStandings(rows, players, "merged");

  const plusMinusRanked = [...totals].sort(
    (a, b) => b.plusMinus - a.plusMinus || b.games - a.games,
  );
  const goldenBoot = rankByRate(totals, "goals", GOLDEN_BOOT_MIN_GAMES).sort(
    (a, b) => b.goals - a.goals || b.rate - a.rate,
  );

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Table</h1>
        <a href="/rules" className="rulebook-link">
          📖 Rulebook
        </a>
      </header>

      <PillTabs
        activeId={tab}
        tabs={[
          { id: "plus-minus", label: "Plus-Minus", href: "/?tab=plus-minus" },
          { id: "golden-boot", label: "Golden Boot", href: "/?tab=golden-boot" },
        ]}
      />

      {tab === "plus-minus" &&
        (plusMinusRanked.length === 0 ? (
          <div className="empty-state">No standings in this dataset yet.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th className="num">P</th>
                  <th className="num">W-D-L</th>
                  <th className="num">+/-</th>
                </tr>
              </thead>
              <tbody>
                {plusMinusRanked.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <a href={`/players/${p.canonicalId}`} className="leaderboard-name">
                        {p.displayName.toUpperCase()}
                      </a>
                    </td>
                    <td className="num">{p.games}</td>
                    <td className="num">{formatWDL(p.wins, p.ties, p.losses)}</td>
                    <td className={`num ${plusMinusClass(p.plusMinus)}`}>
                      {formatPlusMinus(p.plusMinus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "golden-boot" &&
        (goldenBoot.length === 0 ? (
          <div className="empty-state">
            No player has reached the minimum {GOLDEN_BOOT_MIN_GAMES} games yet.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th className="num">Goals</th>
                  <th className="num">Per game</th>
                </tr>
              </thead>
              <tbody>
                {goldenBoot.map((p, i) => (
                  <tr key={p.canonicalId}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <a href={`/players/${p.canonicalId}`} className="leaderboard-name">
                        {p.displayName.toUpperCase()}
                      </a>
                    </td>
                    <td className="num">{p.goals}</td>
                    <td className="num">{p.rate.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </main>
  );
}
