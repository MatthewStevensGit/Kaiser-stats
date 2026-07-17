import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getScheduledGameById } from "@/lib/matchday/data";
import { getLiveDraftState } from "@/lib/matchday/draft-actions";
import { getRegistrationStatus } from "@/lib/matchday/registration-window";
import { listPlayers } from "@/lib/stats-engine/data";
import { BackLink } from "../../../_components/BackLink";
import { DraftPanel } from "../../../_components/DraftPanel";

// Real Supabase-backed data — must never be cached or prerendered at build time.
export const dynamic = "force-dynamic";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  await requireAdmin(`/matchday/${gameId}`);

  const game = await getScheduledGameById(gameId);
  if (!game) notFound();

  const [draftState, players] = await Promise.all([getLiveDraftState(gameId), listPlayers()]);

  return (
    <main>
      <BackLink fallbackHref={`/matchday/${gameId}`} />
      <header className="screen-header-row">
        <h1 className="screen-header">Draft</h1>
      </header>

      {game.cancelled ? (
        <div className="game-cancelled-banner">This game has been cancelled.</div>
      ) : getRegistrationStatus(new Date(), game.date, game.league) !== "closed" ? (
        <p className="note">The draft can&rsquo;t start until registration has closed for this game.</p>
      ) : (
        <DraftPanel
          gameId={gameId}
          date={game.date}
          checkedInCanonicalIds={game.checkedInCanonicalIds}
          players={players.map((p) => ({ canonicalId: p.canonicalId, displayName: p.displayName }))}
          draftState={draftState}
        />
      )}
    </main>
  );
}
