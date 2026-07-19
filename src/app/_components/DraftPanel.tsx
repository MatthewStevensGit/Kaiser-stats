"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  beginDraft,
  recordPick,
  restartDraft,
  setDraftCaptains,
  setFirstPickSide,
  setTurnSizes,
  startDraftSetup,
  undoLastPick,
  updateDraftPool,
  type DraftPositionByLeague,
  type DraftSessionState,
} from "@/lib/matchday/draft-actions";
import { buildDefaultTurnSizes } from "@/lib/matchday/draft-order";
import type { DraftSide } from "@/lib/matchday/draft-order";
import { LEAGUE_CAPACITY_BY_LEAGUE } from "@/lib/matchday/constants";
import { ADR_WINDOW_OPTIONS, applyAdrWindow, LOW_SAMPLE_GAME_THRESHOLD, type AdrWindow } from "@/lib/matchday/adr-window";
import { DraftPoolPicker } from "./DraftPoolPicker";
import { useToast } from "./ToastProvider";

const SHOT_CLOCK_SECONDS = 60;

interface PlayerOption {
  canonicalId: string;
  displayName: string;
}

function nameFor(players: PlayerOption[], canonicalId: string | null): string {
  if (!canonicalId) return "";
  return players.find((p) => p.canonicalId === canonicalId)?.displayName ?? canonicalId;
}

/**
 * `*Games` counts are optional — the very first (pre-hydration) paint uses
 * the server's plain DraftPositionByLeague, which has no per-scope count.
 * When absent, no low-sample warning is shown for that brief instant; the
 * windowed client recompute (which always carries counts) takes over
 * immediately after mount — see DraftLivePanel's `now` state.
 */
interface AdrLike extends DraftPositionByLeague {
  saturdayGames?: number;
  sundayGames?: number;
  bothGames?: number;
}

function formatAdrValue(value: number | null, gamesCount: number | undefined): string {
  if (value === null) return "—";
  if (gamesCount !== undefined && gamesCount < LOW_SAMPLE_GAME_THRESHOLD) {
    return `${value.toFixed(1)} (!only ${gamesCount} game${gamesCount === 1 ? "" : "s"})`;
  }
  return value.toFixed(1);
}

/** "New player" only when every scope is null (never actually drafted) — a low sample size still gets a real number, just flagged. */
function AdrLine({ adr }: { adr: AdrLike }) {
  if (adr.saturday === null && adr.sunday === null && adr.both === null) {
    return <>New player</>;
  }
  const lowSample =
    (adr.saturdayGames !== undefined && adr.saturdayGames < LOW_SAMPLE_GAME_THRESHOLD && adr.saturday !== null) ||
    (adr.sundayGames !== undefined && adr.sundayGames < LOW_SAMPLE_GAME_THRESHOLD && adr.sunday !== null) ||
    (adr.bothGames !== undefined && adr.bothGames < LOW_SAMPLE_GAME_THRESHOLD && adr.both !== null);
  return (
    <span className={lowSample ? "draft-pick-adr-low-sample" : undefined}>
      Sat {formatAdrValue(adr.saturday, adr.saturdayGames)} · Sun {formatAdrValue(adr.sunday, adr.sundayGames)} · Both{" "}
      {formatAdrValue(adr.both, adr.bothGames)}
    </span>
  );
}

/** A team's captain + picks so far, in order — shared by the live in-progress view and the post-draft summary so the two never drift apart. */
function TeamRosterSoFar({
  players,
  captainId,
  picks,
}: {
  players: PlayerOption[];
  captainId: string | null;
  picks: { canonicalId: string }[];
}) {
  return (
    <p className="draft-team-roster">
      <strong>{nameFor(players, captainId)}</strong> (captain)
      {picks.length > 0 ? `, ${picks.map((p) => nameFor(players, p.canonicalId)).join(", ")}` : null}
    </p>
  );
}

export function DraftPanel({
  gameId,
  date,
  checkedInCanonicalIds,
  players,
  draftState,
}: {
  gameId: string;
  date: string;
  checkedInCanonicalIds: string[];
  players: PlayerOption[];
  draftState: DraftSessionState | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  if (!draftState) {
    return (
      <div className="card">
        <p className="note">No draft has been started for this game yet.</p>
        <button
          type="button"
          className="login-form-submit"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await startDraftSetup(gameId);
                if (!result.ok) return showToast("error", result.error);
                showToast("success", "Draft started — set up the pool, captains, and pick order.");
                router.refresh();
              } catch {
                showToast("error", "Something went wrong — please try again.");
              }
            })
          }
        >
          {isPending ? "Starting..." : "Start Draft"}
        </button>
      </div>
    );
  }

  if (draftState.status === "setup") {
    return (
      <DraftSetupForm
        checkedInCanonicalIds={checkedInCanonicalIds}
        players={players}
        draftState={draftState}
      />
    );
  }

  if (draftState.status === "in_progress") {
    return <DraftLivePanel players={players} draftState={draftState} />;
  }

  return <DraftCompletedSummary date={date} players={players} draftState={draftState} />;
}

function DraftSetupForm({
  checkedInCanonicalIds,
  players,
  draftState,
}: {
  checkedInCanonicalIds: string[];
  players: PlayerOption[];
  draftState: DraftSessionState;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [pool, setPool] = useState<Set<string>>(
    () => new Set(draftState.poolCanonicalIds.length > 0 ? draftState.poolCanonicalIds : checkedInCanonicalIds),
  );
  const [homeCaptainId, setHomeCaptainId] = useState(draftState.homeCaptainId ?? "");
  const [awayCaptainId, setAwayCaptainId] = useState(draftState.awayCaptainId ?? "");
  const [firstPickSide, setFirstPickSideState] = useState<DraftSide | null>(draftState.firstPickSide);

  const remainingCount = Math.max(pool.size - (homeCaptainId ? 1 : 0) - (awayCaptainId ? 1 : 0), 0);
  const defaultTurnSizes = useMemo(() => buildDefaultTurnSizes(remainingCount), [remainingCount]);
  // null = "track the live computed default as captains change" (see remainingCount
  // above, which correctly recomputes every render); once the admin types their own
  // override it's kept exactly as typed, never silently recomputed out from under them.
  const [manualOverride, setManualOverride] = useState<string | null>(
    () => draftState.turnSizes?.join(" ") ?? null,
  );
  const turnSizesText = manualOverride ?? defaultTurnSizes.join(" ");

  const poolOptions = players
    .filter((p) => pool.has(p.canonicalId))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const canBegin = homeCaptainId && awayCaptainId && firstPickSide && turnSizesText.trim() !== "";

  /** Persists the form's current local state — shared by "Save Setup" and "Begin
   * Draft" so beginning a draft never depends on Save Setup having been clicked
   * first (previously, clicking Begin Draft without a prior Save Setup left
   * captains/coin-flip/turn-sizes unpersisted, so the server correctly but
   * confusingly reported them as unset even though the admin had picked them in
   * the UI). Returns ok/error so callers can decide what to do next. */
  async function persistSetup(): Promise<{ ok: true } | { ok: false; error: string }> {
    const poolResult = await updateDraftPool(draftState.id, Array.from(pool));
    if (!poolResult.ok) return poolResult;

    if (homeCaptainId && awayCaptainId) {
      const captainsResult = await setDraftCaptains(draftState.id, homeCaptainId, awayCaptainId);
      if (!captainsResult.ok) return captainsResult;
    }

    if (firstPickSide) {
      const firstPickResult = await setFirstPickSide(draftState.id, firstPickSide);
      if (!firstPickResult.ok) return firstPickResult;
    }

    return setTurnSizes(draftState.id, turnSizesText);
  }

  function handleSaveSetup() {
    startTransition(async () => {
      try {
        const result = await persistSetup();
        if (!result.ok) return showToast("error", result.error);
        showToast("success", "Draft setup saved.");
        router.refresh();
      } catch {
        showToast("error", "Something went wrong — please try again.");
      }
    });
  }

  function handleBegin() {
    startTransition(async () => {
      try {
        const saveResult = await persistSetup();
        if (!saveResult.ok) return showToast("error", saveResult.error);

        const result = await beginDraft(draftState.id);
        if (!result.ok) return showToast("error", result.error);
        showToast("success", "Draft begun!");
        router.refresh();
      } catch {
        showToast("error", "Something went wrong — please try again.");
      }
    });
  }

  return (
    <div className="card draft-setup">
      <h2>1. Draft pool</h2>
      <p className="note">Pre-filled from who&rsquo;s checked in — add or remove as needed.</p>
      <DraftPoolPicker
        players={players}
        pool={pool}
        onChange={setPool}
        disabled={isPending}
        capacity={LEAGUE_CAPACITY_BY_LEAGUE[draftState.league]}
      />

      <h2>2. Captains</h2>
      <div className="draft-captain-row">
        <select
          className="login-form-input"
          value={homeCaptainId}
          onChange={(e) => setHomeCaptainId(e.target.value)}
          disabled={isPending}
        >
          <option value="">Home captain...</option>
          {poolOptions.map((p) => (
            <option key={p.canonicalId} value={p.canonicalId}>
              {p.displayName}
            </option>
          ))}
        </select>
        <select
          className="login-form-input"
          value={awayCaptainId}
          onChange={(e) => setAwayCaptainId(e.target.value)}
          disabled={isPending}
        >
          <option value="">Away captain...</option>
          {poolOptions.map((p) => (
            <option key={p.canonicalId} value={p.canonicalId}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>

      {homeCaptainId && awayCaptainId && (
        <>
          <h2>3. Who won the coin flip?</h2>
          <div className="draft-coinflip-row">
            <button
              type="button"
              className={firstPickSide === "home" ? "login-form-submit" : "edit-game-button"}
              onClick={() => setFirstPickSideState("home")}
              disabled={isPending}
            >
              {nameFor(players, homeCaptainId)}
            </button>
            <button
              type="button"
              className={firstPickSide === "away" ? "login-form-submit" : "edit-game-button"}
              onClick={() => setFirstPickSideState("away")}
              disabled={isPending}
            >
              {nameFor(players, awayCaptainId)}
            </button>
          </div>
        </>
      )}

      <h2>4. Pick sequence</h2>
      <p className="note">
        Computed default for {remainingCount} remaining player{remainingCount === 1 ? "" : "s"}
        {homeCaptainId && awayCaptainId ? ` (pool of ${pool.size}, minus your 2 captains)` : ""}: edit if the
        captains want something different.
      </p>
      <input
        type="text"
        className="login-form-input"
        value={turnSizesText}
        onChange={(e) => setManualOverride(e.target.value)}
        disabled={isPending}
      />

      <div className="draft-setup-actions">
        <button type="button" className="edit-game-button" onClick={handleSaveSetup} disabled={isPending}>
          {isPending ? "Saving..." : "Save Setup"}
        </button>
        <button
          type="button"
          className="login-form-submit"
          onClick={handleBegin}
          disabled={isPending || !canBegin}
        >
          Begin Draft
        </button>
      </div>
    </div>
  );
}

function DraftLivePanel({
  players,
  draftState,
}: {
  players: PlayerOption[];
  draftState: DraftSessionState;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [secondsLeft, setSecondsLeft] = useState(SHOT_CLOCK_SECONDS);
  const [adrWindow, setAdrWindow] = useState<AdrWindow>("6m");
  // Stays null through the initial server-matching render (so hydration never
  // has to reconcile a client-only `new Date()` against server HTML), then
  // gets set once right after mount — see the effect below.
  const [now, setNow] = useState<Date | null>(null);

  const pickCount = draftState.picks.length;

  useEffect(() => {
    setSecondsLeft(SHOT_CLOCK_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => clearInterval(interval);
    // Reset the clock every time a new pick has been recorded.
  }, [pickCount]);

  useEffect(() => {
    setNow(new Date());
  }, []);

  // The 3-qualifying-games minimum (adr-window.ts) applies even to "All
  // Time" — before `now` is set (the very first paint), fall back to the
  // server's own already-sorted list so hydration has nothing to reconcile.
  const remainingRanked =
    now === null ? draftState.remainingRanked : applyAdrWindow(draftState.remainingRanked, draftState.pickHistory, adrWindow, now);

  function handlePick(canonicalId: string, displayName: string) {
    startTransition(async () => {
      try {
        const result = await recordPick(draftState.id, canonicalId);
        if (!result.ok) return showToast("error", result.error);
        showToast("success", `${displayName} drafted!`);
        router.refresh();
      } catch {
        showToast("error", "Something went wrong — please try again.");
      }
    });
  }

  function handleUndoLastPick(displayName: string) {
    startTransition(async () => {
      try {
        const result = await undoLastPick(draftState.id);
        if (!result.ok) return showToast("error", result.error);
        showToast("success", `Undid ${displayName}'s pick.`);
        router.refresh();
      } catch {
        showToast("error", "Something went wrong — please try again.");
      }
    });
  }

  const currentCaptainId = draftState.currentSide === "home" ? draftState.homeCaptainId : draftState.awayCaptainId;
  const homePicks = draftState.picks.filter((p) => p.side === "home").sort((a, b) => a.pickNumber - b.pickNumber);
  const awayPicks = draftState.picks.filter((p) => p.side === "away").sort((a, b) => a.pickNumber - b.pickNumber);
  const lastPick =
    draftState.picks.length > 0 ? draftState.picks.reduce((a, b) => (a.pickNumber > b.pickNumber ? a : b)) : null;

  return (
    <div className="card">
      <p className="draft-current-turn">
        {nameFor(players, currentCaptainId)}&rsquo;s pick (#{pickCount + 1})
      </p>
      <p className={secondsLeft <= 0 ? "draft-shot-clock draft-shot-clock-expired" : "draft-shot-clock"}>
        {secondsLeft <= 0 ? "Time's up!" : `${secondsLeft}s`}
      </p>

      <div className="draft-teams-so-far">
        <TeamRosterSoFar players={players} captainId={draftState.homeCaptainId} picks={homePicks} />
        <TeamRosterSoFar players={players} captainId={draftState.awayCaptainId} picks={awayPicks} />
      </div>

      {lastPick && (
        <button
          type="button"
          className="edit-game-button draft-undo-button"
          disabled={isPending}
          onClick={() => handleUndoLastPick(nameFor(players, lastPick.canonicalId))}
        >
          Undo last pick ({nameFor(players, lastPick.canonicalId)})
        </button>
      )}

      <label htmlFor="draft-adr-window" className="login-form-label">
        Avg draft position — time range
      </label>
      <select
        id="draft-adr-window"
        className="login-form-input"
        value={adrWindow}
        onChange={(e) => setAdrWindow(e.target.value as AdrWindow)}
      >
        {ADR_WINDOW_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>

      <div className="draft-pick-list">
        {remainingRanked.map((p, i) => (
          <button
            key={p.canonicalId}
            type="button"
            className={
              p.positionallyNeeded ? "draft-pick-button" : "draft-pick-button draft-pick-button-surplus"
            }
            onClick={() => handlePick(p.canonicalId, p.displayName)}
            disabled={isPending}
          >
            {i === 0 && <span className="draft-pick-recommended">Recommended</span>}
            <span className="draft-pick-name">{p.displayName}</span>
            {p.positions.length > 0 && <span className="draft-pick-positions">{p.positions.join(" / ")}</span>}
            {!p.positionallyNeeded && (
              <span className="draft-pick-surplus-note">Position need already covered</span>
            )}
            <span className="draft-pick-adr">
              <AdrLine adr={p.avgDraftPosition} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DraftCompletedSummary({
  date,
  players,
  draftState,
}: {
  date: string;
  players: PlayerOption[];
  draftState: DraftSessionState;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const homePicks = draftState.picks.filter((p) => p.side === "home").sort((a, b) => a.pickNumber - b.pickNumber);
  const awayPicks = draftState.picks.filter((p) => p.side === "away").sort((a, b) => a.pickNumber - b.pickNumber);
  // The completed draft's own game_records id (see draftGameId() in
  // src/lib/report-parser/save.ts) — distinct from this scheduled game's id
  // (draftState.gameId), which is just the scheduled_games foreign key.
  const matchGameId = `draft-${date}-${draftState.league}`;

  function handleRestart() {
    const confirmed = window.confirm(
      "Restart this draft? This clears every pick made and the finalized match result — captains will pick again from scratch.",
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const result = await restartDraft(draftState.id);
        if (!result.ok) return showToast("error", result.error);
        showToast("success", "Draft restarted — set up captains and pick order again.");
        router.refresh();
      } catch {
        showToast("error", "Something went wrong — please try again.");
      }
    });
  }

  function handleUndoLastPick(displayName: string) {
    startTransition(async () => {
      try {
        const result = await undoLastPick(draftState.id);
        if (!result.ok) return showToast("error", result.error);
        showToast("success", `Undid ${displayName}'s pick — draft reopened.`);
        router.refresh();
      } catch {
        showToast("error", "Something went wrong — please try again.");
      }
    });
  }

  const lastPick =
    draftState.picks.length > 0 ? draftState.picks.reduce((a, b) => (a.pickNumber > b.pickNumber ? a : b)) : null;

  return (
    <div className="card">
      <p className="note">Draft complete.</p>
      <h2>{nameFor(players, draftState.homeCaptainId)}&rsquo;s team</h2>
      <TeamRosterSoFar players={players} captainId={draftState.homeCaptainId} picks={homePicks} />
      <h2>{nameFor(players, draftState.awayCaptainId)}&rsquo;s team</h2>
      <TeamRosterSoFar players={players} captainId={draftState.awayCaptainId} picks={awayPicks} />
      <a href={`/matches/${matchGameId}`} className="rulebook-link">
        View match →
      </a>
      <div className="draft-setup-actions">
        {lastPick && (
          <button
            type="button"
            className="edit-game-button"
            disabled={isPending}
            onClick={() => handleUndoLastPick(nameFor(players, lastPick.canonicalId))}
          >
            Undo last pick ({nameFor(players, lastPick.canonicalId)})
          </button>
        )}
        <button type="button" className="edit-game-button" onClick={handleRestart} disabled={isPending}>
          {isPending ? "Restarting..." : "Restart Draft"}
        </button>
      </div>
    </div>
  );
}
