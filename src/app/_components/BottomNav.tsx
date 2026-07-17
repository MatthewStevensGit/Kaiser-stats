"use client";

import { useRouter, usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

const NAV_ITEMS = [
  { id: "table", label: "Stats", href: "/" },
  { id: "matches", label: "Matches", href: "/matches" },
  { id: "matchday", label: "Matchday", href: "/matchday" },
  { id: "other-stats", label: "Other Stats", href: "/other-stats" },
  { id: "rules", label: "Rules", href: "/rules" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function BottomNav({ displayName }: { displayName?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <a
            key={item.id}
            href={item.href}
            className={active ? "bottom-nav-item bottom-nav-item-active" : "bottom-nav-item"}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </a>
        );
      })}

      {displayName ? (
        <>
          <a href="/settings" className="bottom-nav-item bottom-nav-item-name-case">
            {displayName.split(" ")[0] ?? displayName}
          </a>
          <button type="button" onClick={handleLogOut} className="bottom-nav-item bottom-nav-logout">
            Log Out
          </button>
        </>
      ) : (
        <a href="/login" className="bottom-nav-item">
          Log In
        </a>
      )}
    </nav>
  );
}
