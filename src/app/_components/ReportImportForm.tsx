"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { previewReportImport, saveReportImport, type ReportPreview } from "@/lib/report-parser/actions";
import { formatScoreLine, getMultiGoalNickname } from "@/lib/format";
import { summarizeGoalsByScorer } from "@/lib/stats-engine/goal-summary";
import type { League } from "@/lib/stats-engine/types";
import { GoalChip } from "./GoalChip";

export function ReportImportForm({ currentUserCanonicalId }: { currentUserCanonicalId: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [league, setLeague] = useState<League>("saturday");
  const [firstPickRaw, setFirstPickRaw] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();
  const [isSaving, startSaving] = useTransition();

  function nameFor(canonicalId: string): string {
    return preview?.displayNames[canonicalId] ?? canonicalId;
  }

  /** Bolds whoever is logged in, wherever a name renders — instead of baking a "(you)" marker into stored data. */
  function renderName(canonicalId: string) {
    const name = nameFor(canonicalId);
    return canonicalId === currentUserCanonicalId ? <strong>{name}</strong> : name;
  }

  function renderNameList(canonicalIds: string[]) {
    if (canonicalIds.length === 0) return "—";
    return canonicalIds.map((id, i) => (
      <span key={id}>
        {i > 0 && ", "}
        {renderName(id)}
      </span>
    ));
  }

  function handleParse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPreview(null);
    startParsing(async () => {
      const result = await previewReportImport({
        text,
        date,
        league,
        firstPickRaw: firstPickRaw.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result.preview);
    });
  }

  function handleSave() {
    if (!preview) return;
    setError(null);
    startSaving(async () => {
      const result = await saveReportImport(preview, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/matches");
      router.refresh();
    });
  }

  const isPending = isParsing || isSaving;
  const scorers = preview ? summarizeGoalsByScorer(preview.gameRecord.goals) : [];

  return (
    <>
      <form onSubmit={handleParse} className="report-import-form">
        <label htmlFor="report-date" className="login-form-label">
          Date
        </label>
        <input
          id="report-date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="login-form-input"
          disabled={isPending}
        />

        <label htmlFor="report-league" className="login-form-label">
          League
        </label>
        <select
          id="report-league"
          value={league}
          onChange={(e) => setLeague(e.target.value as League)}
          className="login-form-input"
          disabled={isPending}
        >
          <option value="saturday">Saturday</option>
          <option value="sunday">Sunday</option>
        </select>

        <label htmlFor="report-first-pick" className="login-form-label">
          First pick (optional)
        </label>
        <input
          id="report-first-pick"
          type="text"
          placeholder="Only if you know who picked first"
          value={firstPickRaw}
          onChange={(e) => setFirstPickRaw(e.target.value)}
          className="login-form-input"
          disabled={isPending}
        />

        <label htmlFor="report-text" className="login-form-label">
          Report text
        </label>
        <textarea
          id="report-text"
          required
          placeholder="Paste the full report email thread, including replies, in order."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="login-form-input report-import-textarea"
          rows={12}
          disabled={isPending}
        />

        {error && <p className="note login-form-error">{error}</p>}

        <button type="submit" className="login-form-submit" disabled={isPending}>
          {isParsing ? "Parsing..." : "Parse"}
        </button>
      </form>

      {preview && (
        <section className="card report-import-preview">
          <h2>Preview</h2>
          <p className="player-summary-line">
            {preview.gameRecord.date} · {preview.gameRecord.league} ·{" "}
            {formatScoreLine(preview.gameRecord.homeScore, preview.gameRecord.awayScore)}
          </p>

          {preview.goalSumMismatch && (
            <p className="report-import-warning">
              Goal count doesn&apos;t match the stated score — double-check before saving.
            </p>
          )}
          {preview.firstPickWarning && <p className="report-import-warning">{preview.firstPickWarning}</p>}

          <h3>Home roster</h3>
          <p>{renderNameList(preview.gameRecord.homeRoster.map((s) => s.canonicalId))}</p>

          <h3>Away roster</h3>
          <p>{renderNameList(preview.gameRecord.awayRoster.map((s) => s.canonicalId))}</p>

          {scorers.length > 0 && (
            <>
              <h3>Goals</h3>
              <ul className="match-detail-goal-list">
                {scorers.map((scorer) => {
                  const nickname = getMultiGoalNickname(scorer.goals);
                  return (
                    <li key={scorer.scorerCanonicalId} className={`match-detail-goal-${scorer.team}`}>
                      <span className="match-detail-scorer-name">{renderName(scorer.scorerCanonicalId)}</span>
                      <GoalChip count={scorer.goals} />
                      {nickname && <span className="match-detail-goal-nickname">{nickname}</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {preview.gameRecord.mvpCanonicalId && (
            <>
              <h3>MVP</h3>
              <p>{renderName(preview.gameRecord.mvpCanonicalId)}</p>
            </>
          )}

          {preview.gameRecord.notableMentions.length > 0 && (
            <>
              <h3>Notable mentions</h3>
              <ul>
                {preview.gameRecord.notableMentions.map((m, i) => (
                  <li key={i}>
                    <strong>{nameFor(m.canonicalId)}</strong>: &ldquo;{m.quote}&rdquo;
                  </li>
                ))}
              </ul>
            </>
          )}

          {preview.flaggedNames.length > 0 && (
            <div className="report-import-flag-list">
              <h3>Flagged names (excluded — needs a human decision)</h3>
              <ul>
                {preview.flaggedNames.map((f) => (
                  <li key={f.raw}>
                    &ldquo;{f.raw}&rdquo;
                    {f.candidates[0] &&
                      ` — closest match: ${f.candidates[0].displayName} (distance ${f.candidates[0].distance})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.provisionedPlayers.length > 0 && (
            <div className="report-import-flag-list">
              <h3>New players auto-tracked</h3>
              <p>{preview.provisionedPlayers.map((p) => p.displayName).join(", ")}</p>
            </div>
          )}

          <button type="button" onClick={handleSave} className="login-form-submit" disabled={isPending}>
            {isSaving ? "Saving..." : "Save to database"}
          </button>
        </section>
      )}
    </>
  );
}
