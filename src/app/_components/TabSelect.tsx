"use client";

import { useRouter } from "next/navigation";

export interface TabSelectOption {
  id: string;
  label: string;
}

/**
 * A <select> that navigates on change, built from a plain href per option
 * (same convention as PillTabs) — used where two independent filters need
 * to sit side by side on one row instead of stacking as two separate pill
 * rows (see Table/Other Stats pages).
 */
export function TabSelect({
  value,
  options,
  hrefFor,
  ariaLabel,
}: {
  value: string;
  options: TabSelectOption[];
  hrefFor: (id: string) => string;
  ariaLabel: string;
}) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(e) => router.push(hrefFor(e.target.value))}
      className="tab-select"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
