import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { formatMatchDateLabel } from "@/lib/format";
import { LEAGUE_CAPACITY, LEAGUE_MINIMUM } from "@/lib/matchday/constants";
import { getScheduledGameById } from "@/lib/matchday/data";
import { getRegistrationStatus, getRegistrationWindowUtc } from "@/lib/matchday/registration-window";
import { CapacityRing } from "../../_components/CapacityRing";
import { RegistrationStatusBar } from "../../_components/RegistrationStatusBar";
import { ScheduledGameStatusLine } from "../../_components/ScheduledGameStatusLine";

// Real Supabase-backed data, and getRegistrationStatus depends on the real
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

  return (
    <main>
      <a href="/matchday" className="back-link">
        ← Back to matchday
      </a>
      <header className="player-header">
        <h1 className="screen-header">{formatMatchDateLabel(game.date)}</h1>
        <ScheduledGameStatusLine kickoffLabel={game.kickoffLabel} venue={game.venue} />
        {user?.isAdmin && (
          <Link href={`/matchday/${gameId}/edit`} className="edit-game-button">
            Edit Game
          </Link>
        )}
      </header>

      {game.cancelled ? (
        <div className="game-cancelled-banner">This game has been cancelled.</div>
      ) : (
        <>
          <CapacityRing
            checkedIn={game.checkedInCanonicalIds.length}
            capacity={LEAGUE_CAPACITY}
            minimum={LEAGUE_MINIMUM}
          />
          <RegistrationStatusBar
            status={getRegistrationStatus(new Date(), game.date, game.league)}
            {...getRegistrationWindowUtc(game.date, game.league)}
          />
        </>
      )}
    </main>
  );
}
