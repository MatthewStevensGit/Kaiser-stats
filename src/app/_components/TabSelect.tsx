"use client";

import { useRouter } from "next/navigation";

export interface TabSelectOption {
  id: string;
  label: string;
  href: string;
}

/**
 * A <select> that navigates on change, built from a plain href per option
 * (same convention as PillTabs) — used where two independent filters need
 * to sit side by side on one row instead of stacking as two separate pill
 * rows (see Table/Other Stats pages). Options carry their own precomputed
 * href rather than a builder function — Server Components can't pass
 * functions as props to a Client Component like this one.
 */
export function TabSelect({
  value,
  options,
  ariaLabel,
}: {
  value: string;
  options: TabSelectOption[];
  ariaLabel: string;
}) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const href = options.find((o) => o.id === e.target.value)?.href;
    if (href) router.push(href);
  }

  return (
    <select value={value} onChange={handleChange} className="tab-select" aria-label={ariaLabel}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
