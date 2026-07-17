"use client";

import { useRouter } from "next/navigation";

/**
 * A real history-back navigation, not a fresh link to a fixed URL — that
 * distinction is the whole point. A plain `<a href="/matches">` always
 * starts the destination at the top of the page, since the browser treats
 * it as a brand-new visit. Popping back through actual session history
 * instead lets the browser's own native scroll restoration put you right
 * back where you were scrolled to on the list you came from. Switching
 * screens via the bottom nav is unaffected — that's still a fresh forward
 * navigation to a different URL, so it correctly starts at the top.
 */
export function BackLink({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  function handleClick() {
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  }

  return (
    <button type="button" onClick={handleClick} className="back-link">
      ← Back
    </button>
  );
}
