"use client";

import { fmt } from "@/lib/calculations";

const DEFAULT_FIELD_EDITS = { sales: 0, collections: 0, sales_return: 0, remarks: 0 };

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
      <div className="hidden md:block bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3 text-right">Sales</th>
              <th className="p-3 text-right">Collections</th>
              <th className="p-3 text-right">Collection Gap</th>
              <th className="p-3 text-right">Sales Return</th>
              <th className="p-3 text-right">Other Tran.</th>
              <th className="p-3 text-right">Net Sales</th>
              <th className="p-3">Remarks</th>
              {onEdit && <th className="p-3"></th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-3">{e.entry_date}</td>
                <td className={`p-3 text-right ${cellClass(e, "sales")}`}>
                  {fmt(e.sales)}
                  <EditBadge count={editCount(e, "sales")} />
                </td>
                <td className={`p-3 text-right ${cellClass(e, "collections")}`}>
                  {fmt(e.collections)}
                  <EditBadge count={editCount(e, "collections")} />
                </td>
                <td className="p-3 text-right">{fmt(e.collection_gap)}</td>
                <td className={`p-3 text-right ${cellClass(e, "sales_return")}`}>
                  {fmt(e.sales_return)}
                  <EditBadge count={editCount(e, "sales_return")} />
                </td>
                <td className={`p-3 text-right ${cellClass(e, "other_transaction")}`}>
                  {fmt(e.other_transaction)}
                  <EditBadge count={editCount(e, "other_transaction")} />
                </td>
                <td className="p-3 text-right">{fmt(e.net_sales)}</td>
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
          <div key={e.id} className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold">{e.entry_date}</p>
              <p className="text-sm font-semibold">{fmt(e.net_sales)} Net</p>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-sm text-gray-600">
              <span>Sales</span>
              <span className={`text-right ${cellClass(e, "sales")}`}>
                {fmt(e.sales)}
                <EditBadge count={editCount(e, "sales")} />
              </span>
              <span>Collections</span>
              <span className={`text-right ${cellClass(e, "collections")}`}>
                {fmt(e.collections)}
                <EditBadge count={editCount(e, "collections")} />
              </span>
              <span>Collection Gap</span>
              <span className="text-right">{fmt(e.collection_gap)}</span>
              <span>Sales Return</span>
              <span className={`text-right ${cellClass(e, "sales_return")}`}>
                {fmt(e.sales_return)}
                <EditBadge count={editCount(e, "sales_return")} />
              </span>
              <span>Other Transaction</span>
              <span className={`text-right ${cellClass(e, "other_transaction")}`}>
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
