"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  beginDraft,
  recordPick,
  setDraftCaptains,
  setFirstPickSide,
  setTurnSizes,
  startDraftSetup,
  updateDraftPool,
  type DraftSessionState,
} from "@/lib/matchday/draft-actions";
import { buildDefaultTurnSizes } from "@/lib/matchday/draft-order";
import type { DraftSide } from "@/lib/matchday/draft-order";

const SHOT_CLOCK_SECONDS = 60;

interface PlayerOption {
  canonicalId: string;
  displayName: string;
}

function nameFor(players: PlayerOption[], canonicalId: string | null): string {
  if (!canonicalId) return "";
  return players.find((p) => p.canonicalId === canonicalId)?.displayName ?? canonicalId;
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
  const [error, setError] = useState<string | null>(null);
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
              setError(null);
              const result = await startDraftSetup(gameId);
              if (!result.ok) return setError(result.error);
              router.refresh();
            })
          }
        >
          {isPending ? "Starting..." : "Start Draft"}
        </button>
        {error && <p className="note login-form-error">{error}</p>}
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [pool, setPool] = useState<Set<string>>(
    () => new Set(draftState.poolCanonicalIds.length > 0 ? draftState.poolCanonicalIds : checkedInCanonicalIds),
  );
  const [homeCaptainId, setHomeCaptainId] = useState(draftState.homeCaptainId ?? "");
  const [awayCaptainId, setAwayCaptainId] = useState(draftState.awayCaptainId ?? "");
  const [firstPickSide, setFirstPickSideState] = useState<DraftSide | null>(draftState.firstPickSide);

  const remainingCount = Math.max(pool.size - (homeCaptainId ? 1 : 0) - (awayCaptainId ? 1 : 0), 0);
  const defaultTurnSizes = useMemo(() => buildDefaultTurnSizes(remainingCount), [remainingCount]);
  const [turnSizesText, setTurnSizesText] = useState(() =>
    (draftState.turnSizes ?? defaultTurnSizes).join(" "),
  );

  function togglePoolMember(canonicalId: string) {
    setPool((prev) => {
      const next = new Set(prev);
      if (next.has(canonicalId)) next.delete(canonicalId);
      else next.add(canonicalId);
      return next;
    });
  }

  const poolOptions = players.filter((p) => pool.has(p.canonicalId));
  const canBegin = homeCaptainId && awayCaptainId && firstPickSide && turnSizesText.trim() !== "";

  function handleSaveSetup() {
    setError(null);
    startTransition(async () => {
      const poolResult = await updateDraftPool(draftState.id, Array.from(pool));
      if (!poolResult.ok) return setError(poolResult.error);

      if (homeCaptainId && awayCaptainId) {
        const captainsResult = await setDraftCaptains(draftState.id, homeCaptainId, awayCaptainId);
        if (!captainsResult.ok) return setError(captainsResult.error);
      }

      if (firstPickSide) {
        const firstPickResult = await setFirstPickSide(draftState.id, firstPickSide);
        if (!firstPickResult.ok) return setError(firstPickResult.error);
      }

      const turnSizesResult = await setTurnSizes(draftState.id, turnSizesText);
      if (!turnSizesResult.ok) return setError(turnSizesResult.error);

      router.refresh();
    });
  }

  function handleBegin() {
    setError(null);
    startTransition(async () => {
      const result = await beginDraft(draftState.id);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="card draft-setup">
      <h2>1. Draft pool</h2>
      <p className="note">Pre-filled from who&rsquo;s checked in — add or remove as needed.</p>
      <div className="draft-pool-list">
        {players.map((p) => (
          <label key={p.canonicalId} className="draft-pool-item">
            <input
              type="checkbox"
              checked={pool.has(p.canonicalId)}
              onChange={() => togglePoolMember(p.canonicalId)}
              disabled={isPending}
            />
            {p.displayName}
          </label>
        ))}
      </div>

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
        Computed default for {remainingCount} remaining player{remainingCount === 1 ? "" : "s"}: edit if the
        captains want something different.
      </p>
      <input
        type="text"
        className="login-form-input"
        value={turnSizesText}
        onChange={(e) => setTurnSizesText(e.target.value)}
        disabled={isPending}
      />

      {error && <p className="note login-form-error">{error}</p>}

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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [secondsLeft, setSecondsLeft] = useState(SHOT_CLOCK_SECONDS);

  const pickCount = draftState.picks.length;

  useEffect(() => {
    setSecondsLeft(SHOT_CLOCK_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => clearInterval(interval);
    // Reset the clock every time a new pick has been recorded.
  }, [pickCount]);

  function handlePick(canonicalId: string) {
    setError(null);
    startTransition(async () => {
      const result = await recordPick(draftState.id, canonicalId);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  const currentCaptainId = draftState.currentSide === "home" ? draftState.homeCaptainId : draftState.awayCaptainId;

  return (
    <div className="card">
      <p className="draft-current-turn">
        {nameFor(players, currentCaptainId)}&rsquo;s pick (#{pickCount + 1})
      </p>
      <p className={secondsLeft <= 0 ? "draft-shot-clock draft-shot-clock-expired" : "draft-shot-clock"}>
        {secondsLeft <= 0 ? "Time's up!" : `${secondsLeft}s`}
      </p>

      {error && <p className="note login-form-error">{error}</p>}

      <div className="draft-pick-list">
        {draftState.remainingRanked.map((p, i) => (
          <button
            key={p.canonicalId}
            type="button"
            className="draft-pick-button"
            onClick={() => handlePick(p.canonicalId)}
            disabled={isPending}
          >
            {i === 0 && <span className="draft-pick-recommended">Recommended</span>}
            {p.displayName}
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
  const homePicks = draftState.picks.filter((p) => p.side === "home").sort((a, b) => a.pickNumber - b.pickNumber);
  const awayPicks = draftState.picks.filter((p) => p.side === "away").sort((a, b) => a.pickNumber - b.pickNumber);
  // The completed draft's own game_records id (see draftGameId() in
  // src/lib/report-parser/save.ts) — distinct from this scheduled game's id
  // (draftState.gameId), which is just the scheduled_games foreign key.
  const matchGameId = `draft-${date}-${draftState.league}`;

  return (
    <div className="card">
      <p className="note">Draft complete.</p>
      <h2>{nameFor(players, draftState.homeCaptainId)}&rsquo;s team</h2>
      <p>
        {nameFor(players, draftState.homeCaptainId)} (captain)
        {homePicks.length > 0 && ", "}
        {homePicks.map((p) => nameFor(players, p.canonicalId)).join(", ")}
      </p>
      <h2>{nameFor(players, draftState.awayCaptainId)}&rsquo;s team</h2>
      <p>
        {nameFor(players, draftState.awayCaptainId)} (captain)
        {awayPicks.length > 0 && ", "}
        {awayPicks.map((p) => nameFor(players, p.canonicalId)).join(", ")}
      </p>
      <a href={`/matches/${matchGameId}`} className="rulebook-link">
        View match →
      </a>
    </div>
  );
}
