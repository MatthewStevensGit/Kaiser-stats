"use client";

import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { id: "table", label: "Stats", href: "/" },
  { id: "matches", label: "Matches", href: "/matches" },
  { id: "matchday", label: "Matchday", href: "/matchday" },
  { id: "other-stats", label: "Other Stats", href: "/other-stats" },
  { id: "rules", label: "Rules", href: "/rules" },
  { id: "chat", label: "💬", href: "/chat", ariaLabel: "Chat" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function BottomNav({ displayName }: { displayName?: string }) {
  const pathname = usePathname();

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
            aria-label={"ariaLabel" in item ? item.ariaLabel : undefined}
          >
            {item.label}
          </a>
        );
      })}

      <a
        href={displayName ? "/settings" : "/login"}
        className="bottom-nav-item"
        aria-label={displayName ? "Settings" : "Log In"}
      >
        {displayName ? "⚙️" : "Log In"}
      </a>
    </nav>
  );
}
