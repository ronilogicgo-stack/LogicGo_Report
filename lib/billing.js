/** Helpers for the Billing module (invoices, recurring bills). */

/** Given a date string (YYYY-MM-DD) and an interval, returns the next
 * occurrence - used both to suggest the first next_billing_date for a
 * new recurring invoice, and to advance it after "Generate Next
 * Invoice" is used. */
export function advanceDate(dateStr, interval) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (interval === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
  } else if (interval === "yearly") {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else {
    // monthly (default)
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/** Sums a list of { quantity, rate } line items into a subtotal. */
export function sumItems(items) {
  return items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0);
}

export const STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-slate-200 text-slate-500 line-through",
};

export function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** True if an invoice is unpaid and past its due date - purely a
 * display heuristic; it does not write back to the stored `status`. */
export function isOverdue(invoice) {
  if (!invoice.due_date) return false;
  if (invoice.status === "paid" || invoice.status === "cancelled") return false;
  return invoice.due_date < new Date().toISOString().slice(0, 10) && invoice.due_amount > 0;
}
