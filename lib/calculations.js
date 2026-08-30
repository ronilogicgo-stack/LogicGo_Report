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
 * Daily Collection Gap = Net Sales - Collections
 * Matches employee sheet column D: =F19-C19
 */
export function dailyCollectionGap(sales, salesReturn, collections) {
  return netSales(sales, salesReturn) - (Number(collections) || 0);
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
 * Dues Recovery = Collections Achievement - Net Sales
 * Matches employee sheet: Monthly Dues Recovery = Opening Dues - Closing Dues,
 * which algebraically simplifies to Collections - Net Sales (i.e. the
 * exact negative of the Collection Gap - a positive number means old
 * dues were paid down this month, a negative number means dues grew).
 */
export function duesRecovery(collectionsAchievement, netSalesTotal) {
  return (Number(collectionsAchievement) || 0) - (Number(netSalesTotal) || 0);
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

  const netSalesTotal = netSales(totals.sales, totals.sales_return);
  const gap = monthlyCollectionGap(netSalesTotal, totals.collections);
  // Month Closing Dues = Opening Dues + Net Sales - Collections Achievement
  const closingDues = openingDues + netSalesTotal - totals.collections;
  const duesRecoveryAmount = duesRecovery(totals.collections, netSalesTotal);

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
    dues_recovery: duesRecoveryAmount,
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

/** Returns YYYY-MM-DD for a given Date, in local time (no timezone shift) */
export function dateKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Color palette for charts - cycles through if there are more items than colors */
export const CHART_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#ec4899", "#14b8a6", "#a855f7",
  "#f97316", "#84cc16",
];
