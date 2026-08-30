// =====================================================================
// SHARED CALCULATION LOGIC
// This file is the single source of truth for every number shown on
// both the Admin dashboard and the Sales Person dashboard.
// Never re-implement these formulas anywhere else - always import
// from here, so every sales person is calculated exactly the same way
// (same as the original Excel sheet's logic).
// =====================================================================

/**
 * Net Sales = Sales - Sales Return
 * (Also enforced in the DB as a generated column, this is for
 *  client-side live previews before saving.)
 */
export function netSales(sales, salesReturn) {
  return (Number(sales) || 0) - (Number(salesReturn) || 0);
}

/**
 * Collection Gap = Collection Target - Total Collections Achieved
 * Positive value = shortfall vs target, Negative = exceeded target.
 */
export function collectionGap(collectionTarget, totalCollections) {
  return (Number(collectionTarget) || 0) - (Number(totalCollections) || 0);
}

/**
 * Aggregates a list of daily_entries rows (for one sales person, one month)
 * into the same summary shape used in the original "Monthly & Yearly
 * Sales Report" sheet.
 */
export function summarizeMonth(entries, target) {
  const totals = entries.reduce(
    (acc, e) => {
      acc.sales += Number(e.sales) || 0;
      acc.collections += Number(e.collections) || 0;
      acc.sales_return += Number(e.sales_return) || 0;
      return acc;
    },
    { sales: 0, collections: 0, sales_return: 0 }
  );

  const salesTarget = Number(target?.sales_target) || 0;
  const collectionTarget = Number(target?.collection_target) || 0;
  const openingDues = Number(target?.opening_dues) || 0;

  const netSalesTotal = netSales(totals.sales, totals.sales_return);
  const gap = collectionGap(collectionTarget, totals.collections);
  // Closing dues = Opening dues + Net Sales - Collections
  const closingDues = openingDues + netSalesTotal - totals.collections;

  return {
    sales_target: salesTarget,
    sales_achievement: totals.sales,
    collection_target: collectionTarget,
    collection_achievement: totals.collections,
    collection_gap: gap,
    sales_return: totals.sales_return,
    net_sales: netSalesTotal,
    opening_dues: openingDues,
    closing_dues: closingDues,
  };
}

/** Formats a number as currency-style string, e.g. 1,234 */
export function fmt(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Returns YYYY-MM-01 for a given Date, used as the `month` key */
export function monthKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
