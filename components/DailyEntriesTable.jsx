"use client";

import { fmt } from "@/lib/calculations";

/**
 * Shared history table used by both the Sales Person's own dashboard and
 * the Admin's per-employee detail page. Any entry that has been edited
 * (edit_count > 0) - whether by the sales person or by an Admin - is
 * highlighted in red with a badge showing exactly how many times it's
 * been changed.
 */
export default function DailyEntriesTable({ entries, loading, onEdit, editorNames = {} }) {
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
              <th className="p-3 text-right">Net Sales</th>
              <th className="p-3">Remarks</th>
              <th className="p-3">Edits</th>
              {onEdit && <th className="p-3"></th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const edited = e.edit_count > 0;
              return (
                <tr
                  key={e.id}
                  className={`border-t ${edited ? "bg-red-50" : ""}`}
                >
                  <td className="p-3">{e.entry_date}</td>
                  <td className="p-3 text-right">{fmt(e.sales)}</td>
                  <td className="p-3 text-right">{fmt(e.collections)}</td>
                  <td className="p-3 text-right">{fmt(e.collection_gap)}</td>
                  <td className="p-3 text-right">{fmt(e.sales_return)}</td>
                  <td className="p-3 text-right">{fmt(e.net_sales)}</td>
                  <td className="p-3">{e.remarks}</td>
                  <td className="p-3">
                    {edited ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        Edited {e.edit_count}×
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
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
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- MOBILE: stacked cards ---------- */}
      <div className="md:hidden space-y-3">
        {entries.map((e) => {
          const edited = e.edit_count > 0;
          return (
            <div
              key={e.id}
              className={`rounded-xl shadow p-4 ${edited ? "bg-red-50 ring-1 ring-red-200" : "bg-white"}`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold">{e.entry_date}</p>
                <div className="flex items-center gap-2">
                  {edited && (
                    <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                      Edited {e.edit_count}×
                    </span>
                  )}
                  <p className="text-sm font-semibold">{fmt(e.net_sales)} Net</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-sm text-gray-600">
                <span>Sales</span>
                <span className="text-right">{fmt(e.sales)}</span>
                <span>Collections</span>
                <span className="text-right">{fmt(e.collections)}</span>
                <span>Collection Gap</span>
                <span className="text-right">{fmt(e.collection_gap)}</span>
                <span>Sales Return</span>
                <span className="text-right">{fmt(e.sales_return)}</span>
              </div>
              {e.remarks && (
                <p className="text-xs text-gray-500 mt-2 border-t pt-2">{e.remarks}</p>
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
          );
        })}
      </div>
    </>
  );
}
