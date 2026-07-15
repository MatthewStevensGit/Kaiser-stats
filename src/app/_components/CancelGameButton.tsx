"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { formatMatchDateLabel } from "@/lib/format";
import { cancelScheduledGame } from "@/lib/matchday/actions";

export function CancelGameButton({ gameId, date }: { gameId: string; date: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      `Are you sure you wish to cancel this game on ${formatMatchDateLabel(date)}?`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await cancelScheduledGame(gameId);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="cancel-game-button"
      aria-label={`Cancel game on ${formatMatchDateLabel(date)}`}
      title="Cancel this game"
    >
      ×
    </button>
  );
}
