"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelSelfCheckIn, checkInSelf } from "@/lib/matchday/actions";

export function SelfCheckInButton({
  gameId,
  isCheckedIn,
  registrationOpen,
}: {
  gameId: string;
  isCheckedIn: boolean;
  registrationOpen: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = isCheckedIn ? await cancelSelfCheckIn(gameId) : await checkInSelf(gameId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!registrationOpen && !isCheckedIn) return null;

  return (
    <div className="self-checkin">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={isCheckedIn ? "self-checkin-button self-checkin-button-cancel" : "self-checkin-button"}
      >
        {isPending ? "..." : isCheckedIn ? "Cancel Check-In" : "Check In"}
      </button>
      {error && <p className="note login-form-error">{error}</p>}
    </div>
  );
}
