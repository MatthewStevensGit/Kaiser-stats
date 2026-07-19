"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeAllCheckIns } from "@/lib/matchday/actions";
import { useToast } from "./ToastProvider";

export function RemoveAllCheckInsButton({ gameId, count }: { gameId: string; count: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      `Remove all ${count} checked-in player${count === 1 ? "" : "s"}? This can't be undone from here.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const result = await removeAllCheckIns(gameId);
        if (!result.ok) return showToast("error", result.error);
        showToast("success", "Removed everyone's check-in.");
        router.refresh();
      } catch {
        showToast("error", "Something went wrong — please try again.");
      }
    });
  }

  return (
    <button type="button" className="checkin-edit-remove" onClick={handleClick} disabled={isPending}>
      {isPending ? "Removing..." : "Remove All"}
    </button>
  );
}
