"use client";

import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { id: "table", label: "Table", href: "/" },
  { id: "matches", label: "Matches", href: "/matches" },
  { id: "matchday", label: "Matchday", href: "/matchday" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function BottomNav() {
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
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
