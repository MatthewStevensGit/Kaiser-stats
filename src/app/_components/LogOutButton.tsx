"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

export function LogOutButton() {
  async function handleClick() {
    if (!window.confirm("Are you sure you want to log out?")) return;
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Ignored — even if signOut() itself throws (network hiccup), the
      // hard navigation below still takes them to a real, fresh /login
      // request, which is the actual thing that matters here.
    }
    // A full reload, not router.push()+refresh() — this guarantees every
    // page's client-side state and the router's own cache are completely
    // gone, not just the one page currently mounted. That combination was
    // also racy on its own terms (see login/page.tsx's doc comment).
    window.location.href = "/login";
  }

  return (
    <button type="button" onClick={handleClick} className="checkin-edit-remove">
      Log Out
    </button>
  );
}
