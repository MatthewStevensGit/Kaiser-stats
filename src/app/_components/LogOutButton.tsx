"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

export function LogOutButton() {
  const router = useRouter();

  async function handleClick() {
    if (!window.confirm("Are you sure you want to log out?")) return;
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={handleClick} className="checkin-edit-remove">
      Log Out
    </button>
  );
}
