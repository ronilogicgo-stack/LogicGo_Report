/** Helpers for the POS module (products, traders, sales invoices). */

export const TRADER_TYPES = [
  { value: "customer", label: "Customer" },
  { value: "supplier", label: "Supplier" },
  { value: "dealer", label: "Dealer" },
  { value: "retailer", label: "Retailer" },
];

export function traderTypeLabel(type) {
  return TRADER_TYPES.find((t) => t.value === type)?.label || type;
}

/** Sums a list of { quantity, rate } line items into a subtotal. */
export function sumItems(items) {
  return items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0);
}
