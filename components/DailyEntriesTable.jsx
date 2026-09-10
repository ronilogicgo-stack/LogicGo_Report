"use client";

import { fmt } from "@/lib/calculations";

const DEFAULT_FIELD_EDITS = { sales: 0, collections: 0, sales_return: 0, remarks: 0 };

const TAG_STYLES = {
  holiday: "bg-amber-100 text-amber-700",
  leave: "bg-sky-100 text-sky-700",
  custom: "bg-violet-100 text-violet-700",
  requested: "bg-red-100 text-red-700",
};

const TAG_LABELS = {
  holiday: "Holiday",
  leave: "Leave",
  custom: "Note",
  requested: "Needs Entry",
};

function EntryTypeTag({ entryType }) {
  if (!entryType || entryType === "submitted") return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
        TAG_STYLES[entryType] || "bg-slate-100 text-slate-600"
      }`}
    >
      {TAG_LABELS[entryType] || entryType}
    </span>
  );
}

function editCount(entry, field) {
  return entry?.field_edits?.[field] ?? 0;
}

function cellClass(entry, field) {
  return editCount(entry, field) > 0
    ? "bg-red-50 text-red-700 font-medium"
    : "";
}

function EditBadge({ count }) {
  if (!count) return null;
  return (
    <span
      title={`Edited ${count} time${count === 1 ? "" : "s"}`}
      className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-[9px] font-bold text-red-700 bg-red-100 rounded-full px-1.5 py-0.5"
    >
      ✎ {count}
    </span>
  );
}

/**
 * Shared history table used by both the Sales Person's own dashboard and
 * the Admin's per-employee detail page. Only the EXACT field that was
 * changed after the entry was first saved gets highlighted in red with
 * a small "×N" count - not the whole row - whether the edit came from
 * the sales person themselves or from an Admin.
 */
export default function DailyEntriesTable({ entries, loading, onEdit }) {
  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }
  if (entries.length === 0) {
    return <p className="text-gray-500">No entries yet this month.</p>;
  }

  return (
    <>
      {/* ---------- DESKTOP: table ---------- */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3 text-right num">Sales</th>
              <th className="p-3 text-right num">Collections</th>
              <th className="p-3 text-right num">Collection Gap</th>
              <th className="p-3 text-right num">Sales Return</th>
              <th className="p-3 text-right num">Other Tran.</th>
              <th className="p-3 text-right num">Net Sales</th>
              <th className="p-3">Remarks</th>
              {onEdit && <th className="p-3"></th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={`border-t ${e.entry_type === "requested" ? "bg-red-50/40" : ""}`}>
                <td className="p-3">
                  <span className="inline-flex items-center gap-2">
                    {e.entry_date}
                    <EntryTypeTag entryType={e.entry_type} />
                  </span>
                </td>
                <td className={`p-3 text-right num ${cellClass(e, "sales")}`}>
                  {fmt(e.sales)}
                  <EditBadge count={editCount(e, "sales")} />
                </td>
                <td className={`p-3 text-right num ${cellClass(e, "collections")}`}>
                  {fmt(e.collections)}
                  <EditBadge count={editCount(e, "collections")} />
                </td>
                <td className="p-3 text-right num">{fmt(e.collection_gap)}</td>
                <td className={`p-3 text-right num ${cellClass(e, "sales_return")}`}>
                  {fmt(e.sales_return)}
                  <EditBadge count={editCount(e, "sales_return")} />
                </td>
                <td className={`p-3 text-right num ${cellClass(e, "other_transaction")}`}>
                  {fmt(e.other_transaction)}
                  <EditBadge count={editCount(e, "other_transaction")} />
                </td>
                <td className="p-3 text-right num">{fmt(e.net_sales)}</td>
                <td className={`p-3 ${cellClass(e, "remarks")}`}>
                  {e.remarks}
                  <EditBadge count={editCount(e, "remarks")} />
                </td>
                {onEdit && (
                  <td className="p-3">
                    <button
                      onClick={() => onEdit(e)}
                      className="text-xs text-blue-600 underline"
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- MOBILE: stacked cards ---------- */}
      <div className="md:hidden space-y-3">
        {entries.map((e) => (
          <div key={e.id} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 ${e.entry_type === "requested" ? "border-red-200 bg-red-50/40" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold inline-flex items-center gap-2">
                {e.entry_date}
                <EntryTypeTag entryType={e.entry_type} />
              </p>
              <p className="text-sm font-semibold">{fmt(e.net_sales)} Net</p>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-sm text-gray-600">
              <span>Sales</span>
              <span className={`text-right num ${cellClass(e, "sales")}`}>
                {fmt(e.sales)}
                <EditBadge count={editCount(e, "sales")} />
              </span>
              <span>Collections</span>
              <span className={`text-right num ${cellClass(e, "collections")}`}>
                {fmt(e.collections)}
                <EditBadge count={editCount(e, "collections")} />
              </span>
              <span>Collection Gap</span>
              <span className="text-right num">{fmt(e.collection_gap)}</span>
              <span>Sales Return</span>
              <span className={`text-right num ${cellClass(e, "sales_return")}`}>
                {fmt(e.sales_return)}
                <EditBadge count={editCount(e, "sales_return")} />
              </span>
              <span>Other Transaction</span>
              <span className={`text-right num ${cellClass(e, "other_transaction")}`}>
                {fmt(e.other_transaction)}
                <EditBadge count={editCount(e, "other_transaction")} />
              </span>
            </div>
            {e.remarks && (
              <p className={`text-xs mt-2 border-t pt-2 ${cellClass(e, "remarks") || "text-gray-500"}`}>
                {e.remarks}
                <EditBadge count={editCount(e, "remarks")} />
              </p>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(e)}
                className="text-xs text-blue-600 underline mt-2"
              >
                Edit
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
