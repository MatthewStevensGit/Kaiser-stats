"use client";

import { usePathname } from "next/navigation";
import { ProfileMenu } from "./ProfileMenu";

const NAV_ITEMS = [
  { id: "table", label: "Stats", href: "/", tourId: "nav-stats" },
  { id: "matches", label: "History", href: "/matches", tourId: "nav-history" },
  { id: "matchday", label: "Check-In", href: "/matchday", tourId: "nav-checkin" },
  { id: "rules", label: "Rules", href: "/rules", tourId: "nav-rules" },
  { id: "chat", label: "💬", href: "/chat", ariaLabel: "Chat", tourId: "nav-chat" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function TopNav({ displayName, isAdmin }: { displayName?: string; isAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="top-nav" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <a
            key={item.id}
            href={item.href}
            className={active ? "top-nav-item top-nav-item-active" : "top-nav-item"}
            aria-current={active ? "page" : undefined}
            aria-label={"ariaLabel" in item ? item.ariaLabel : undefined}
            data-tour-id={item.tourId}
          >
            {item.label}
          </a>
        );
      })}

      <ProfileMenu displayName={displayName} isAdmin={isAdmin} />
    </nav>
  );
}
