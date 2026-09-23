export const RMA_STATUSES = [
  "Created",
  "Under Control",
  "Working on It",
  "QC",
  "Ready for Delivery",
  "Sent to Courier",
  "Customer Received",
  "Closed",
];

export const STATUS_COLORS = {
  Created: "bg-slate-100 text-slate-600",
  "Under Control": "bg-blue-100 text-blue-700",
  "Working on It": "bg-amber-100 text-amber-700",
  QC: "bg-purple-100 text-purple-700",
  "Ready for Delivery": "bg-teal-100 text-teal-700",
  "Sent to Courier": "bg-indigo-100 text-indigo-700",
  "Customer Received": "bg-emerald-100 text-emerald-700",
  Closed: "bg-gray-200 text-gray-500",
};

export const ACTION_LABELS = {
  created: "RMA Created",
  took_control: "Taken Under Control",
  status_changed: "Status Changed",
  remark_added: "Remark Added",
  estimated_delivery_updated: "Estimated Delivery Updated",
  diagnosis_added: "Diagnosis Added",
  repair_added: "Repair Action Added",
  qc_completed: "QC Completed",
  courier_updated: "Sent to Courier",
  customer_received: "Customer Received",
  closed: "RMA Closed",
};

export function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " — " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
  );
}
