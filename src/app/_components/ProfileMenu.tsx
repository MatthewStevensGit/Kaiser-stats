"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import { startTour } from "@/lib/tour/tour-state";
import { ADMIN_TOUR_STEPS, GENERAL_TOUR_STEPS } from "@/lib/tour/steps";

/** Generic avatar glyph — a plain silhouette, not tied to any specific user's photo. */
function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

/**
 * The Profile tab — a top-nav item in its own right (highlights active on
 * /settings and /login, same as any other tab), but tapping it opens a
 * dropdown rather than navigating directly, since Settings and Log In/Out
 * are sub-destinations of "your account," not their own top-level tabs.
 */
export function ProfileMenu({ displayName, isAdmin }: { displayName?: string; isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const active = pathname.startsWith("/settings") || pathname === "/login";

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleLogOut() {
    if (!window.confirm("Are you sure you want to log out?")) return;
    setOpen(false);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function handleTakeTour() {
    setOpen(false);
    startTour("general");
    router.push(GENERAL_TOUR_STEPS[0]!.path);
  }

  function handleTakeAdminTour() {
    setOpen(false);
    startTour("admin");
    router.push(ADMIN_TOUR_STEPS[0]!.path);
  }

  return (
    <div className="profile-menu" ref={containerRef}>
      <button
        type="button"
        className={active ? "top-nav-item profile-menu-trigger top-nav-item-active" : "top-nav-item profile-menu-trigger"}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Profile"
        data-tour-id="profile-menu"
      >
        <ProfileIcon />
      </button>
      {open && (
        <div className="profile-menu-dropdown" role="menu">
          {displayName ? (
            <>
              <a
                href="/settings"
                className="profile-menu-item"
                role="menuitem"
                onClick={() => setOpen(false)}
                data-tour-id="settings-link"
              >
                Settings
              </a>
              <button type="button" className="profile-menu-item" role="menuitem" onClick={handleTakeTour}>
                Take a tour
              </button>
              {isAdmin && (
                <button type="button" className="profile-menu-item" role="menuitem" onClick={handleTakeAdminTour}>
                  Admin tour
                </button>
              )}
              <button type="button" className="profile-menu-item profile-menu-item-danger" role="menuitem" onClick={handleLogOut}>
                Log Out
              </button>
            </>
          ) : (
            <a href="/login" className="profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              Log In
            </a>
          )}
        </div>
      )}
    </div>
  );
}
