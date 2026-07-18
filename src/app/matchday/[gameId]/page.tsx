import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { formatMatchDateLabel } from "@/lib/format";
import { LEAGUE_CAPACITY_BY_LEAGUE, LEAGUE_MINIMUM } from "@/lib/matchday/constants";
import { getScheduledGameById } from "@/lib/matchday/data";
import {
  computeMatchdayStatusTier,
  getRegistrationStatus,
  getRegistrationWindowUtc,
} from "@/lib/matchday/registration-window";
import { listPlayers } from "@/lib/stats-engine/data";
import { BackLink } from "../../_components/BackLink";
import { CapacityRing } from "../../_components/CapacityRing";
import { CheckedInNamesToggle } from "../../_components/CheckedInNamesToggle";
import { RegistrationStatusBar } from "../../_components/RegistrationStatusBar";
import { ScheduledGameStatusLine } from "../../_components/ScheduledGameStatusLine";
import { SelfCheckInButton } from "../../_components/SelfCheckInButton";

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
  const [game, user, players] = await Promise.all([getScheduledGameById(gameId), getCurrentUser(), listPlayers()]);
  if (!game) notFound();

  const now = new Date();
  const capacity = LEAGUE_CAPACITY_BY_LEAGUE[game.league];
  const checkedInCount = game.checkedInCanonicalIds.length;
  const tier = computeMatchdayStatusTier(now, game.date, game.league, checkedInCount, capacity);
  const registrationStatus = getRegistrationStatus(now, game.date, game.league);
  const nameById = new Map(players.map((p) => [p.canonicalId, p.displayName]));
  const checkedInNames = game.checkedInCanonicalIds.map((id) => nameById.get(id) ?? id);

  return (
    <main>
      <BackLink fallbackHref="/matchday" />
      <header className="player-header">
        <h1 className="screen-header">{formatMatchDateLabel(game.date)}</h1>
        <ScheduledGameStatusLine tier={tier} kickoffLabel={game.kickoffLabel} venue={game.venue} />
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
          <CheckedInNamesToggle
            className="checkedin-toggle checkedin-toggle-capacity"
            triggerLabel={<CapacityRing checkedIn={checkedInCount} capacity={capacity} minimum={LEAGUE_MINIMUM} />}
            triggerAriaLabel={`${checkedInCount} of ${capacity} checked in — click to see who`}
            names={checkedInNames}
          />
          <RegistrationStatusBar tier={tier} {...getRegistrationWindowUtc(game.date, game.league)} />
          {user && (
            <SelfCheckInButton
              gameId={gameId}
              isCheckedIn={game.checkedInCanonicalIds.includes(user.canonicalId)}
              registrationOpen={registrationStatus === "open"}
            />
          )}
          {user?.isAdmin &&
            (registrationStatus === "closed" ? (
              <Link href={`/matchday/${gameId}/draft`} className="start-draft-button">
                Start Draft
              </Link>
            ) : (
              <span className="start-draft-button start-draft-button-disabled" aria-disabled="true">
                Start Draft
              </span>
            ))}
        </>
      )}
    </main>
  );
}
