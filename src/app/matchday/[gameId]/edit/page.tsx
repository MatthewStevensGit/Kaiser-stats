import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { formatMatchDateLabel } from "@/lib/format";
import { getGameCheckinDetails, getRosterForPicker, getScheduledGameById } from "@/lib/matchday/data";
import { cancelScheduledGameFormAction, removeCheckInFormAction } from "@/lib/matchday/actions";
import {
  formatCutoffLabel,
  formatEasternDateTimeLocal,
  resolveRegistrationCutoffUtc,
} from "@/lib/matchday/registration-window";
import { rosterDisplayName } from "@/lib/stats-engine/identity";
import { AddPlayerPicker } from "../../../_components/AddPlayerPicker";
import { BackLink } from "../../../_components/BackLink";
import { EditGameDetailsForm } from "../../../_components/EditGameDetailsForm";
import { PasteRosterForm } from "../../../_components/PasteRosterForm";
import { RemoveAllCheckInsButton } from "../../../_components/RemoveAllCheckInsButton";

export const dynamic = "force-dynamic";

export default async function EditGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  await requireAdmin(`/matchday/${gameId}`);

  const game = await getScheduledGameById(gameId);
  if (!game) notFound();

  const checkins = await getGameCheckinDetails(gameId);
  const roster = await getRosterForPicker(checkins.map((c) => c.canonicalId));

  const effectiveCutoffUtc = resolveRegistrationCutoffUtc(game.date, game.league, game.cutoffOverrideUtc);

  return (
    <main>
      <BackLink fallbackHref={`/matchday/${gameId}`} />
      <header className="screen-header-row">
        <h1 className="screen-header">Edit {formatMatchDateLabel(game.date)}</h1>
      </header>

      <section className="card">
        <h2>Game details</h2>
        <p className="note">
          {formatMatchDateLabel(game.date)} — date and league can&rsquo;t be changed here; cancel
          and re-create the game if either is genuinely wrong.
        </p>
        <p className="note">Registration closes: {formatCutoffLabel(effectiveCutoffUtc)}</p>
        <EditGameDetailsForm
          gameId={gameId}
          kickoffLabel={game.kickoffLabel}
          venue={game.venue}
          cutoffLocalDefault={formatEasternDateTimeLocal(effectiveCutoffUtc)}
        />
      </section>

      <section className="card">
        <header className="screen-header-row">
          <h2>Checked in ({checkins.length})</h2>
          {checkins.length > 0 && <RemoveAllCheckInsButton gameId={gameId} count={checkins.length} />}
        </header>
        {checkins.length === 0 ? (
          <p className="note">No one checked in yet.</p>
        ) : (
          <ul className="checkin-edit-list">
            {checkins.map((c) => (
              <li key={c.canonicalId} className="checkin-edit-row">
                <span>{rosterDisplayName(c)}</span>
                <form action={removeCheckInFormAction.bind(null, gameId, c.canonicalId)}>
                  <button type="submit" className="checkin-edit-remove">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Add a player</h2>
        <AddPlayerPicker gameId={gameId} roster={roster} />
      </section>

      <section className="card">
        <h2>Paste a roster list</h2>
        <PasteRosterForm gameId={gameId} />
      </section>

      <section className="card">
        <h2>Already have the match report?</h2>
        <p className="note">
          Once the game&rsquo;s been played, paste the full report (score, goals, MVP) instead —
          that&rsquo;s a separate step from checking people in beforehand.
        </p>
        <a href="/matches/import" className="rulebook-link">
          Import match report →
        </a>
      </section>

      <section className="card">
        <h2>Cancel this game</h2>
        {game.cancelled ? (
          <p className="note">Already cancelled.</p>
        ) : (
          <>
            <p className="note">
              For holidays or other one-off changes. This can&apos;t be undone from here.
            </p>
            <form action={cancelScheduledGameFormAction.bind(null, gameId)}>
              <button type="submit" className="checkin-edit-remove">
                Cancel this game
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
