import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { formatMatchDateLabel } from "@/lib/format";
import { LEAGUE_CAPACITY, LEAGUE_MINIMUM } from "@/lib/matchday/constants";
import { getScheduledGameById } from "@/lib/matchday/data";
import { getRegistrationCutoffUtc, isRegistrationOpen } from "@/lib/matchday/registration-window";
import { CapacityRing } from "../../_components/CapacityRing";
import { RegistrationStatusBar } from "../../_components/RegistrationStatusBar";
import { ScheduledGameStatusLine } from "../../_components/ScheduledGameStatusLine";

// Real Supabase-backed data, and isRegistrationOpen depends on the real
// wall-clock "now" — this page must never be cached or prerendered at build
// time.
export const dynamic = "force-dynamic";

export default async function CheckInPortalPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = await getScheduledGameById(gameId);
  if (!game) notFound();

  const user = await getCurrentUser();
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
        {user?.isAdmin && (
          <Link href={`/matchday/${gameId}/edit`} className="edit-game-button">
            Edit Game
          </Link>
        )}
      </header>

      <CapacityRing checkedIn={checkedIn} capacity={LEAGUE_CAPACITY} minimum={LEAGUE_MINIMUM} />
      <RegistrationStatusBar isOpen={isOpen} cutoffUtc={cutoffUtc} />
    </main>
  );
}
