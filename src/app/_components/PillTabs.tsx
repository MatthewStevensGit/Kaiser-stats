export interface PillTab {
  id: string;
  label: string;
  href: string;
}

export function PillTabs({ tabs, activeId }: { tabs: PillTab[]; activeId: string }) {
  return (
    <nav className="pill-tabs" aria-label="View">
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className={tab.id === activeId ? "pill-tab pill-tab-active" : "pill-tab"}
          aria-current={tab.id === activeId ? "page" : undefined}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
