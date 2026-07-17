"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { checkInPastedRoster, type PasteRosterResult } from "@/lib/matchday/actions";

export function PasteRosterForm({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PasteRosterResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await checkInPastedRoster(gameId, text);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setResult(outcome);
      setText("");
      router.refresh();
    });
  }

  return (
    <div>
      <p className="note">
        One name per line — no header or team split needed, e.g. a plain attendance list. Names
        are matched against known players the same way a match report is; a close-but-not-exact
        match gets flagged for you to confirm rather than silently merged.
      </p>
      <form onSubmit={handleSubmit}>
        <textarea
          required
          placeholder={"Emre\nVadim\nBoris\n..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="login-form-input report-import-textarea"
          rows={8}
          disabled={isPending}
        />
        {error && <p className="note login-form-error">{error}</p>}
        <button type="submit" className="login-form-submit" disabled={isPending}>
          {isPending ? "Checking in..." : "Check In Pasted Roster"}
        </button>
      </form>

      {result && (
        <div className="note">
          <p>Checked in {result.checkedIn.length}: {result.checkedIn.join(", ") || "none"}</p>
          {result.alreadyCheckedIn.length > 0 && (
            <p>Already checked in ({result.alreadyCheckedIn.length}): {result.alreadyCheckedIn.join(", ")}</p>
          )}
          {result.provisioned.length > 0 && (
            <p>New players auto-tracked: {result.provisioned.join(", ")}</p>
          )}
          {result.flagged.length > 0 && (
            <div className="report-import-flag-list">
              <h3>Flagged names (not checked in — needs a human decision)</h3>
              <ul>
                {result.flagged.map((f) => (
                  <li key={f.raw}>
                    &ldquo;{f.raw}&rdquo;
                    {f.closestMatch && ` — closest match: ${f.closestMatch}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
