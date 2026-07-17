"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

const NAV_ITEMS = [
  { id: "table", label: "Table", href: "/" },
  { id: "matches", label: "Matches", href: "/matches" },
  { id: "matchday", label: "Matchday", href: "/matchday" },
  { id: "other-stats", label: "Other Stats", href: "/other-stats" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function BottomNav({ displayName }: { displayName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Closes the log-out menu on an outside click — same expectation as any
  // other popup menu, not just the toggle button itself.
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function handleLogOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    setMenuOpen(false);
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
        <div className="bottom-nav-account" ref={menuRef}>
          {menuOpen && (
            <div className="bottom-nav-account-menu">
              <button type="button" onClick={handleLogOut} className="bottom-nav-account-menu-item">
                Log Out
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="bottom-nav-item"
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            {displayName.split(" ")[0] ?? displayName}
          </button>
        </div>
      ) : (
        <a href="/login" className="bottom-nav-item">
          Log In
        </a>
      )}
    </nav>
  );
}
