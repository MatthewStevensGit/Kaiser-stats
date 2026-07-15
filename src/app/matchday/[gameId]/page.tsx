import { notFound } from "next/navigation";
import { formatMatchDateLabel } from "@/lib/format";
import { LEAGUE_CAPACITY, LEAGUE_MINIMUM } from "@/lib/matchday/constants";
import { getRegistrationCutoffUtc, isRegistrationOpen } from "@/lib/matchday/registration-window";
import { loadSampleData } from "@/lib/sample-data";
import { CapacityRing } from "../../_components/CapacityRing";
import { RegistrationStatusBar } from "../../_components/RegistrationStatusBar";
import { ScheduledGameStatusLine } from "../../_components/ScheduledGameStatusLine";

// isRegistrationOpen depends on the real wall-clock "now" — this page must
// never be cached or prerendered at build time.
export const dynamic = "force-dynamic";

export default async function CheckInPortalPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const { scheduledGames } = loadSampleData();

  const game = scheduledGames.find((g) => g.gameId === gameId);
  if (!game) notFound();

  const checkedIn = game.checkedInCanonicalIds.length;
  const cutoffUtc = getRegistrationCutoffUtc(game.date, game.league);
  const isOpen = isRegistrationOpen(new Date(), game.date, game.league);

  return (
    <main>
      <a href="/matchday" className="back-link">
        ← Back to matchday
      </a>
      <header className="player-header">
        <h1 className="screen-header">{formatMatchDateLabel(game.date)}</h1>
        <ScheduledGameStatusLine league={game.league} />
        <button type="button" className="edit-game-button" title="Admin editing isn't available yet">
          Edit Game
        </button>
      </header>

      <CapacityRing checkedIn={checkedIn} capacity={LEAGUE_CAPACITY} minimum={LEAGUE_MINIMUM} />
      <RegistrationStatusBar isOpen={isOpen} cutoffUtc={cutoffUtc} />
    </main>
  );
}
