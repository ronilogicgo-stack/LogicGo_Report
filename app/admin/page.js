"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { summarizeMonth, fmt, monthKey } from "@/lib/calculations";

export default function AdminDashboard() {
  const supabase = createClient();
  const [month, setMonth] = useState(monthKey());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);

    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name, location")
      .eq("role", "sales_person")
      .eq("status", "approved")
      .order("full_name");

    if (!people || people.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const ids = people.map((p) => p.id);

    const { data: targets } = await supabase
      .from("monthly_targets")
      .select("*")
      .eq("month", month)
      .in("user_id", ids);

    const monthStart = month;
    const monthEndDate = new Date(month);
    monthEndDate.setMonth(monthEndDate.getMonth() + 1);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    const { data: entries } = await supabase
      .from("daily_entries")
      .select("*")
      .in("user_id", ids)
      .gte("entry_date", monthStart)
      .lt("entry_date", monthEnd);

    const built = people.map((person) => {
      const target = targets?.find((t) => t.user_id === person.id);
      const myEntries = entries?.filter((e) => e.user_id === person.id) || [];
      const summary = summarizeMonth(myEntries, target);
      return { person, target, summary };
    });

    setRows(built);
    setLoading(false);
  }, [month, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(row) {
    setEditingId(row.person.id);
    setEditForm({
      sales_target: row.target?.sales_target || 0,
      collection_target: row.target?.collection_target || 0,
      opening_dues: row.target?.opening_dues || 0,
    });
  }

  async function saveTarget(userId) {
    await supabase.from("monthly_targets").upsert(
      {
        user_id: userId,
        month,
        sales_target: Number(editForm.sales_target) || 0,
        collection_target: Number(editForm.collection_target) || 0,
        opening_dues: Number(editForm.opening_dues) || 0,
      },
      { onConflict: "user_id,month" }
    );
    setEditingId(null);
    load();
  }

  const grandTotal = rows.reduce(
    (acc, r) => {
      acc.sales_target += r.summary.sales_target;
      acc.sales_achievement += r.summary.sales_achievement;
      acc.collection_target += r.summary.collection_target;
      acc.collection_achievement += r.summary.collection_achievement;
      acc.collection_gap += r.summary.collection_gap;
      acc.sales_return += r.summary.sales_return;
      acc.net_sales += r.summary.net_sales;
      return acc;
    },
    {
      sales_target: 0,
      sales_achievement: 0,
      collection_target: 0,
      collection_achievement: 0,
      collection_gap: 0,
      sales_return: 0,
      net_sales: 0,
    }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Monthly Sales &amp; Collection Report</h1>
        <input
          type="month"
          value={month.slice(0, 7)}
          onChange={(e) => setMonth(`${e.target.value}-01`)}
          className="border rounded-lg px-3 py-2"
        />
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">
          No approved sales persons yet. Approve requests first.
        </p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-3">Sales Person</th>
                <th className="p-3">Location</th>
                <th className="p-3 text-right">Opening Dues</th>
                <th className="p-3 text-right">Sales Target</th>
                <th className="p-3 text-right">Sales Achv.</th>
                <th className="p-3 text-right">Collection Target</th>
                <th className="p-3 text-right">Collection Achv.</th>
                <th className="p-3 text-right">Gap</th>
                <th className="p-3 text-right">Sales Return</th>
                <th className="p-3 text-right">Net Sales</th>
                <th className="p-3 text-right">Closing Dues</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.person.id} className="border-t">
                  <td className="p-3 font-medium">{r.person.full_name}</td>
                  <td className="p-3">{r.person.location}</td>

                  {editingId === r.person.id ? (
                    <>
                      <td className="p-2">
                        <input
                          type="number"
                          className="w-24 border rounded px-2 py-1"
                          value={editForm.opening_dues}
                          onChange={(e) =>
                            setEditForm({ ...editForm, opening_dues: e.target.value })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          className="w-24 border rounded px-2 py-1"
                          value={editForm.sales_target}
                          onChange={(e) =>
                            setEditForm({ ...editForm, sales_target: e.target.value })
                          }
                        />
                      </td>
                      <td className="p-3 text-right">{fmt(r.summary.sales_achievement)}</td>
                      <td className="p-2">
                        <input
                          type="number"
                          className="w-24 border rounded px-2 py-1"
                          value={editForm.collection_target}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              collection_target: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="p-3 text-right">
                        {fmt(r.summary.collection_achievement)}
                      </td>
                      <td className="p-3 text-right">{fmt(r.summary.collection_gap)}</td>
                      <td className="p-3 text-right">{fmt(r.summary.sales_return)}</td>
                      <td className="p-3 text-right">{fmt(r.summary.net_sales)}</td>
                      <td className="p-3 text-right">{fmt(r.summary.closing_dues)}</td>
                      <td className="p-2">
                        <button
                          onClick={() => saveTarget(r.person.id)}
                          className="bg-black text-white rounded px-3 py-1 text-xs"
                        >
                          Save
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 text-right">{fmt(r.summary.opening_dues)}</td>
                      <td className="p-3 text-right">{fmt(r.summary.sales_target)}</td>
                      <td className="p-3 text-right">{fmt(r.summary.sales_achievement)}</td>
                      <td className="p-3 text-right">{fmt(r.summary.collection_target)}</td>
                      <td className="p-3 text-right">
                        {fmt(r.summary.collection_achievement)}
                      </td>
                      <td className="p-3 text-right">{fmt(r.summary.collection_gap)}</td>
                      <td className="p-3 text-right">{fmt(r.summary.sales_return)}</td>
                      <td className="p-3 text-right">{fmt(r.summary.net_sales)}</td>
                      <td className="p-3 text-right">{fmt(r.summary.closing_dues)}</td>
                      <td className="p-2">
                        <button
                          onClick={() => startEdit(r)}
                          className="text-xs text-blue-600 underline"
                        >
                          Edit Targets
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold border-t">
              <tr>
                <td className="p-3" colSpan={2}>
                  Grand Total
                </td>
                <td className="p-3 text-right">-</td>
                <td className="p-3 text-right">{fmt(grandTotal.sales_target)}</td>
                <td className="p-3 text-right">{fmt(grandTotal.sales_achievement)}</td>
                <td className="p-3 text-right">{fmt(grandTotal.collection_target)}</td>
                <td className="p-3 text-right">{fmt(grandTotal.collection_achievement)}</td>
                <td className="p-3 text-right">{fmt(grandTotal.collection_gap)}</td>
                <td className="p-3 text-right">{fmt(grandTotal.sales_return)}</td>
                <td className="p-3 text-right">{fmt(grandTotal.net_sales)}</td>
                <td className="p-3"></td>
                <td className="p-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
