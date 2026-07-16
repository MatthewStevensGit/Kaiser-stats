"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { previewReportImport, saveReportImport, type ReportPreview } from "@/lib/report-parser/actions";
import { formatScoreLine, getMultiGoalNickname } from "@/lib/format";
import { summarizePlayerGameStats } from "@/lib/stats-engine/goal-summary";
import type { League } from "@/lib/stats-engine/types";
import { AssistChip } from "./AssistChip";
import { GoalChip } from "./GoalChip";

export function ReportImportForm({ currentUserCanonicalId }: { currentUserCanonicalId: string }) {
  const router = useRouter();
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year2, setYear2] = useState("");
  const [league, setLeague] = useState<League>("saturday");
  const [firstPickRaw, setFirstPickRaw] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const dayInputRef = useRef<HTMLInputElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);

  /** Auto-advances to the next date field once this one has 2 digits — same feel as a native date picker. */
  function handleDatePartChange(value: string, setValue: (v: string) => void, next: React.RefObject<HTMLInputElement | null> | null) {
    setValue(value);
    if (value.length >= 2) next?.current?.focus();
  }

  function nameFor(canonicalId: string): string {
    return preview?.displayNames[canonicalId] ?? canonicalId;
  }

  /**
   * Bolds whoever is logged in, wherever a name renders — instead of baking
   * a "(you)" marker into stored data. Optionally also colors the name by
   * team (Stats list only) so it's visually clear who played on which side.
   */
  function renderName(canonicalId: string, team?: "home" | "away") {
    const name = nameFor(canonicalId);
    const isYou = canonicalId === currentUserCanonicalId;
    if (!team) return isYou ? <strong>{name}</strong> : name;
    const className = `match-detail-scorer-name-${team}`;
    return isYou ? <strong className={className}>{name}</strong> : <span className={className}>{name}</span>;
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

    if (!/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day) || !/^\d{2}$/.test(year2)) {
      setError("Enter a valid date (2-digit year).");
      return;
    }
    const date = `20${year2}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

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
  const stats = preview ? summarizePlayerGameStats(preview.gameRecord.goals) : [];

  return (
    <>
      {!preview && (
      <form onSubmit={handleParse} className="report-import-form">
        <label htmlFor="report-month" className="login-form-label">
          Date (MM / DD / YY)
        </label>
        <div className="report-import-date-row">
          <input
            id="report-month"
            type="text"
            inputMode="numeric"
            maxLength={2}
            placeholder="MM"
            required
            value={month}
            onChange={(e) => handleDatePartChange(e.target.value, setMonth, dayInputRef)}
            className="login-form-input"
            disabled={isPending}
          />
          <input
            ref={dayInputRef}
            type="text"
            inputMode="numeric"
            maxLength={2}
            placeholder="DD"
            required
            value={day}
            onChange={(e) => handleDatePartChange(e.target.value, setDay, yearInputRef)}
            className="login-form-input"
            disabled={isPending}
          />
          <input
            ref={yearInputRef}
            type="text"
            inputMode="numeric"
            maxLength={2}
            placeholder="YY"
            required
            value={year2}
            onChange={(e) => handleDatePartChange(e.target.value, setYear2, null)}
            className="login-form-input"
            disabled={isPending}
          />
        </div>

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
          {isParsing ? "Confirming..." : "Confirm"}
        </button>
      </form>
      )}

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
          {preview.pickOrderWarning && <p className="report-import-warning">{preview.pickOrderWarning}</p>}

          <h3>{preview.gameRecord.homeTeamLabel} roster</h3>
          <p>{renderNameList(preview.gameRecord.homeRoster.map((s) => s.canonicalId))}</p>

          <h3>{preview.gameRecord.awayTeamLabel} roster</h3>
          <p>{renderNameList(preview.gameRecord.awayRoster.map((s) => s.canonicalId))}</p>

          {stats.length > 0 && (
            <>
              <h3>Stats</h3>
              <ul className="match-detail-goal-list">
                {stats.map((stat) => {
                  const nickname = getMultiGoalNickname(stat.goals);
                  return (
                    <li key={stat.canonicalId} className={`match-detail-goal-${stat.team}`}>
                      <span className="match-detail-scorer-name">{renderName(stat.canonicalId, stat.team)}</span>
                      <GoalChip count={stat.goals} />
                      <AssistChip count={stat.assists} />
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

          <div className="report-import-preview-actions">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="login-form-resend"
              disabled={isPending}
            >
              ← Edit
            </button>
            <button type="button" onClick={handleSave} className="login-form-submit" disabled={isPending}>
              {isSaving ? "Saving..." : "Save to database"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
