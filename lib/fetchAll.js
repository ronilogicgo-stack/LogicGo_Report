// =====================================================================
// Supabase (PostgREST) caps every single request at a maximum number
// of rows (1000 by default) - a query that matches more rows than that
// silently returns only the first page, with no error. For a small
// team this rarely comes up, but a few years of daily entries across
// several sales persons can quietly cross that line - especially in
// Analytics, Date-Range reports, and "download all my data" exports.
//
// This helper transparently fetches ALL matching rows by paging
// through the results, so those reports stay CORRECT (not just fast)
// no matter how much history has piled up.
// =====================================================================

export async function fetchAllRows(queryFactory, pageSize = 1000) {
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) throw error;

    const batch = data || [];
    if (batch.length === 0) break;

    allRows = allRows.concat(batch);
    from += batch.length;
  }

  return allRows;
}
