// =====================================================================
// SHARED CALCULATION LOGIC
// Every formula here is copied 1:1 from the original Excel sheets:
//   - "Monthly & Yearly Sales Report" (Admin master sheet)
//   - "Daily Sales Report" (per-employee monthly tabs)
// This file is the ONLY place these formulas live. Both the Admin
// dashboard and the Sales Person dashboard import from here, so every
// sales person - old or new - is always calculated the same way.
// =====================================================================

/**
 * Daily Net Sales = Sales - Sales Return
 * Matches employee sheet column F: =B19-E19
 */
export function netSales(sales, salesReturn) {
  return (Number(sales) || 0) - (Number(salesReturn) || 0);
}

/**
 * Daily Collection Gap = Sales - Collections
 * Matches employee sheet column D: =B19-C19
 */
export function dailyCollectionGap(sales, collections) {
  return (Number(sales) || 0) - (Number(collections) || 0);
}

/**
 * Monthly Collection Gap = Net Sales - Collections Achievement
 * Matches Admin master sheet: =NetSales - CollectionsAchievement
 * (Column I: =K7-H7, where K7 = Net Sales, H7 = Collections Achievement)
 */
export function monthlyCollectionGap(netSalesTotal, collectionsAchievement) {
  return (Number(netSalesTotal) || 0) - (Number(collectionsAchievement) || 0);
}

/**
 * Aggregates a list of daily_entries rows (for one sales person, one month)
 * into the exact same summary shape as one row of the Admin master sheet.
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
  const duesRecoveryTarget = Number(target?.dues_recovery_target) || 0;

  const netSalesTotal = netSales(totals.sales, totals.sales_return);
  const gap = monthlyCollectionGap(netSalesTotal, totals.collections);
  // Month Closing Dues = Opening Dues + Net Sales - Collections Achievement
  const closingDues = openingDues + netSalesTotal - totals.collections;

  return {
    opening_dues: openingDues,
    sales_target: salesTarget,
    sales_achievement: totals.sales,
    collection_target: collectionTarget,
    collection_achievement: totals.collections,
    collection_gap: gap,
    sales_return: totals.sales_return,
    net_sales: netSalesTotal,
    closing_dues: closingDues,
    dues_recovery_target: duesRecoveryTarget,
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
