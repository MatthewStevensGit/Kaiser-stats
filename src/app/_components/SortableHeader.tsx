export type SortDir = "asc" | "desc";

/**
 * A clickable column header that toggles sort direction on repeat clicks —
 * a plain link (same URL-driven convention as PillTabs/TabSelect), so it
 * works with no client JS. `href` is precomputed by the caller (a Server
 * Component), same reasoning as TabSelect's options carrying their own
 * href instead of a builder function.
 */
export function SortableHeader({
  label,
  href,
  isActive,
  dir,
}: {
  label: string;
  href: string;
  isActive: boolean;
  dir: SortDir;
}) {
  return (
    <th className="num">
      <a href={href} className="sortable-header">
        {label}
        {isActive && <span aria-hidden="true">{dir === "desc" ? " ▼" : " ▲"}</span>}
      </a>
    </th>
  );
}
