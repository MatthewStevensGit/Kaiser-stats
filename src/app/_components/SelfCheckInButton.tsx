"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cancelSelfCheckIn, checkInSelf } from "@/lib/matchday/actions";
import { useToast } from "./ToastProvider";

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
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const result = isCheckedIn ? await cancelSelfCheckIn(gameId) : await checkInSelf(gameId);
        if (!result.ok) {
          showToast("error", result.error);
          return;
        }
        showToast("success", isCheckedIn ? "Check-in cancelled." : "You're checked in!");
        router.refresh();
      } catch {
        showToast("error", "Something went wrong — please try again.");
      }
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
    </div>
  );
}
