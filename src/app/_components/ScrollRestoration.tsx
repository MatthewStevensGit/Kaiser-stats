"use client";

import { useEffect } from "react";

function scrollStorageKey(): string {
  return `kaiser-scroll:${window.location.pathname}${window.location.search}`;
}

/**
 * These list pages link to their detail pages with a plain `<a href>`, not
 * Next's `<Link>` (see BackLink.tsx's doc comment) — a deliberate hard
 * navigation, so the browser's native scroll restoration would normally take
 * over on the way back. But every page here reads the logged-in user's
 * cookie, which makes it dynamically rendered and ineligible for the
 * browser's bfcache — so "back" is always a fresh network fetch, and native
 * restoration on a fresh fetch is unreliable in practice (confirmed live:
 * scroll position was landing wrong on return, not just occasionally).
 * This restores it ourselves instead: save scrollY to sessionStorage right
 * before the page is torn down, and re-apply it the next time this same
 * URL mounts. `pagehide` covers a real navigation away; `visibilitychange`
 * is a second, redundant save path for mobile browsers that don't always
 * fire `pagehide` when backgrounding a tab.
 */
export function ScrollRestoration() {
  useEffect(() => {
    const key = scrollStorageKey();
    const saved = sessionStorage.getItem(key);
    if (saved !== null) {
      window.scrollTo(0, Number(saved));
      sessionStorage.removeItem(key);
    }

    function save() {
      sessionStorage.setItem(scrollStorageKey(), String(window.scrollY));
    }
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, []);

  return null;
}
