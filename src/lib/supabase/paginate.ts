import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

/**
 * PostgREST caps a plain `.select()` at 1000 rows by default — it does NOT
 * error past that limit, it just silently returns the first page. This bit
 * roster_spots for real once the season's backfilled games pushed it past
 * 1000 rows: a newly-reported game's entire roster went missing from every
 * stats page with no error anywhere, because listGameRecords()'s unpaged
 * fetch simply never saw those rows. Fetches every row via `.range()` pages
 * instead, regardless of how large the table has grown — every stats-engine
 * table here keeps growing every week the league plays, so this isn't a
 * one-time fix, it's the shape every "give me the whole table" query needs.
 */
export async function fetchAllRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  orderColumn?: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    let query = client.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (orderColumn) query = query.order(orderColumn);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}
