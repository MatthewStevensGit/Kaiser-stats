"use client";

import { usePathname } from "next/navigation";

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
  const accountItem = displayName
    ? { id: "account", label: displayName.split(" ")[0] ?? displayName, href: "/" }
    : { id: "account", label: "Log In", href: "/login" };

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {[...NAV_ITEMS, accountItem].map((item) => {
        const active = isActive(pathname, item.href) && item.id !== "account";
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
    </nav>
  );
}
