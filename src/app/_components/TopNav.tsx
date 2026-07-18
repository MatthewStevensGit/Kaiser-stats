"use client";

import { usePathname } from "next/navigation";
import { ProfileMenu } from "./ProfileMenu";

const NAV_ITEMS = [
  { id: "table", label: "Stats", href: "/" },
  { id: "matches", label: "History", href: "/matches" },
  { id: "matchday", label: "Check-In", href: "/matchday" },
  { id: "rules", label: "Rules", href: "/rules" },
  { id: "chat", label: "💬", href: "/chat", ariaLabel: "Chat" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function TopNav({ displayName }: { displayName?: string }) {
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
          >
            {item.label}
          </a>
        );
      })}

      <ProfileMenu displayName={displayName} />
    </nav>
  );
}
