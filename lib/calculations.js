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
 * Dues Recovery = Collections Achievement - Net Sales - Other Transaction
 * Matches employee sheet: Monthly Dues Recovery = Opening Dues - Closing Dues,
 * which algebraically simplifies to Collections - Net Sales - Other
 * Transaction (i.e. the exact negative of the Collection Gap, adjusted
 * for any Other Transaction - a positive number means old dues were
 * paid down this month, a negative number means dues grew).
 */
export function duesRecovery(collectionsAchievement, netSalesTotal, otherTransactionTotal = 0) {
  return (
    (Number(collectionsAchievement) || 0) -
    (Number(netSalesTotal) || 0) -
    (Number(otherTransactionTotal) || 0)
  );
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
      acc.other_transaction += Number(e.other_transaction) || 0;
      return acc;
    },
    { sales: 0, collections: 0, sales_return: 0, other_transaction: 0 }
  );

  const salesTarget = Number(target?.sales_target) || 0;
  const collectionTarget = Number(target?.collection_target) || 0;
  const openingDues = Number(target?.opening_dues) || 0;

  const netSalesTotal = netSales(totals.sales, totals.sales_return);
  const gap = monthlyCollectionGap(netSalesTotal, totals.collections);
  // Month Closing Dues = Opening Dues + Net Sales - Collections Achievement + Other Transaction
  const closingDues = openingDues + netSalesTotal - totals.collections + totals.other_transaction;
  const duesRecoveryAmount = duesRecovery(totals.collections, netSalesTotal, totals.other_transaction);

  return {
    opening_dues: openingDues,
    sales_target: salesTarget,
    sales_achievement: totals.sales,
    collection_target: collectionTarget,
    collection_achievement: totals.collections,
    collection_gap: gap,
    sales_return: totals.sales_return,
    other_transaction: totals.other_transaction,
    net_sales: netSalesTotal,
    closing_dues: closingDues,
    dues_recovery: duesRecoveryAmount,
  };
}

/**
 * Same output shape as summarizeMonth(), but built from a single
 * pre-aggregated row (from the monthly_entry_totals database view)
 * instead of a full list of individual daily_entries rows. Much
 * lighter on the network for pages that only need the monthly totals,
 * not a day-by-day breakdown.
 */
export function summarizeFromTotals(totals, target) {
  const salesTarget = Number(target?.sales_target) || 0;
  const collectionTarget = Number(target?.collection_target) || 0;
  const openingDues = Number(target?.opening_dues) || 0;

  const totalSales = Number(totals?.total_sales) || 0;
  const totalCollections = Number(totals?.total_collections) || 0;
  const totalSalesReturn = Number(totals?.total_sales_return) || 0;
  const totalOtherTransaction = Number(totals?.total_other_transaction) || 0;
  const netSalesTotal = Number(totals?.total_net_sales) || netSales(totalSales, totalSalesReturn);

  const gap = monthlyCollectionGap(netSalesTotal, totalCollections);
  const closingDues = openingDues + netSalesTotal - totalCollections + totalOtherTransaction;
  const duesRecoveryAmount = duesRecovery(totalCollections, netSalesTotal, totalOtherTransaction);

  return {
    opening_dues: openingDues,
    sales_target: salesTarget,
    sales_achievement: totalSales,
    collection_target: collectionTarget,
    collection_achievement: totalCollections,
    collection_gap: gap,
    sales_return: totalSalesReturn,
    other_transaction: totalOtherTransaction,
    net_sales: netSalesTotal,
    closing_dues: closingDues,
    dues_recovery: duesRecoveryAmount,
    days_reported: Number(totals?.days_reported) || 0,
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

/** Returns the first day of the month containing the given YYYY-MM-DD string */
export function monthStartFor(dateStr) {
  const d = new Date(dateStr);
  return dateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Returns how many days are in the month containing the given YYYY-MM-DD string */
export function daysInMonthFor(dateStr) {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Returns the day-of-month number (1-31) for the given YYYY-MM-DD string */
export function dayOfMonthFor(dateStr) {
  return new Date(dateStr).getDate();
}
export const CHART_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#ec4899", "#14b8a6", "#a855f7",
  "#f97316", "#84cc16",
];
