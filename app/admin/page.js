"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { summarizeFromTotals, fmt, monthKey } from "@/lib/calculations";
import { downloadCSV } from "@/lib/csv";
import ExportButtons from "@/components/ExportButtons";

export default function AdminDashboard() {
  const supabase = createClient();
  const [month, setMonth] = useState(monthKey());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name, location, status")
      .eq("is_sales_person", true)
      .in("status", ["approved", "paused"])
      .order("full_name");

    if (!people || people.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const ids = people.map((p) => p.id);

    // One row per person already totaled by the database (via the
    // monthly_entry_totals view) instead of every daily entry for the
    // whole month - much less data to transfer, and no summing needed
    // in the browser.
    const [{ data: targets }, { data: totals }] = await Promise.all([
      supabase.from("monthly_targets").select("*").eq("month", month).in("user_id", ids),
      supabase.from("monthly_entry_totals").select("*").eq("month", month).in("user_id", ids),
    ]);

    const built = people.map((person) => {
      const target = targets?.find((t) => t.user_id === person.id);
      const personTotals = totals?.find((t) => t.user_id === person.id);
      const summary = summarizeFromTotals(personTotals, target);
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
      opening_dues: row.target?.opening_dues || 0,
      sales_target: row.target?.sales_target || 0,
      collection_target: row.target?.collection_target || 0,
    });
  }

  async function saveTarget(userId) {
    const { error } = await supabase.from("monthly_targets").upsert(
      {
        user_id: userId,
        month,
        opening_dues: Number(editForm.opening_dues) || 0,
        sales_target: Number(editForm.sales_target) || 0,
        collection_target: Number(editForm.collection_target) || 0,
      },
      { onConflict: "user_id,month" }
    );
    if (error) {
      alert(`Could not save targets: ${error.message}`);
      return;
    }
    setEditingId(null);
    load();
  }

  async function togglePause(person) {
    setBusyId(person.id);
    const nextStatus = person.status === "paused" ? "approved" : "paused";
    const { error } = await supabase
      .from("profiles")
      .update({ status: nextStatus })
      .eq("id", person.id);
    setBusyId(null);
    if (error) {
      alert(`Could not update status: ${error.message}`);
    }
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
      acc.other_transaction += r.summary.other_transaction;
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
      other_transaction: 0,
      net_sales: 0,
    }
  );

  function exportCSV() {
    const headers = [
      "Sales Person",
      "Location",
      "Opening Dues",
      "Sales Target",
      "Sales Achievement",
      "Collection Target",
      "Collection Achievement",
      "Collection Gap",
      "Sales Return",
      "Other Transaction",
      "Net Sales",
      "Dues Recovery",
      "Closing Dues",
      "Status",
    ];
    const csvRows = rows.map((r) => [
      r.person.full_name,
      r.person.location,
      r.summary.opening_dues,
      r.summary.sales_target,
      r.summary.sales_achievement,
      r.summary.collection_target,
      r.summary.collection_achievement,
      r.summary.collection_gap,
      r.summary.sales_return,
      r.summary.other_transaction,
      r.summary.net_sales,
      r.summary.dues_recovery,
      r.summary.closing_dues,
      r.person.status,
    ]);
    downloadCSV(`sales_report_${month}.csv`, headers, csvRows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">Monthly Sales &amp; Collection Report</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(`${e.target.value}-01`)}
            className="border rounded-lg px-3 py-2 flex-1 sm:flex-none"
          />
          <ExportButtons onDownloadCSV={exportCSV} />
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">
          No approved sales persons yet. Approve requests first.
        </p>
      ) : (
        <div className="print-area">
          {/* ---------- DESKTOP: full table ---------- */}
          <div className="hidden lg:block overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="p-3">Sales Person</th>
                  <th className="p-3">Location</th>
                  <th className="p-3 text-right num">Opening Dues</th>
                  <th className="p-3 text-right num">Sales Target</th>
                  <th className="p-3 text-right num">Sales Achv.</th>
                  <th className="p-3 text-right num">Collection Target</th>
                  <th className="p-3 text-right num">Collection Achv.</th>
                  <th className="p-3 text-right num">Gap</th>
                  <th className="p-3 text-right num">Sales Return</th>
                  <th className="p-3 text-right num">Other Tran.</th>
                  <th className="p-3 text-right num">Net Sales</th>
                  <th className="p-3 text-right num">Dues Recovery</th>
                  <th className="p-3 text-right num">Closing Dues</th>
                  <th className="p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.person.id} className="border-t">
                    <td className="p-3 font-medium">
                      <Link
                        href={`/admin/employee/${r.person.id}?month=${month}`}
                        className="text-blue-600 hover:underline"
                      >
                        {r.person.full_name}
                      </Link>
                    </td>
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
                        <td className={`p-3 text-right num ${achvClass(r.summary.sales_achievement, r.summary.sales_target)}`}>
                          {fmt(r.summary.sales_achievement)}
                        </td>
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
                        <td className={`p-3 text-right num ${achvClass(r.summary.collection_achievement, r.summary.collection_target)}`}>
                          {fmt(r.summary.collection_achievement)}
                        </td>
                        <td className="p-3 text-right num">{fmt(r.summary.collection_gap)}</td>
                        <td className="p-3 text-right num">{fmt(r.summary.sales_return)}</td>
                        <td className="p-3 text-right num">{fmt(r.summary.other_transaction)}</td>
                        <td className="p-3 text-right num">{fmt(r.summary.net_sales)}</td>
                        <td className="p-3 text-right num">{fmt(r.summary.dues_recovery)}</td>
                        <td className="p-3 text-right num">{fmt(r.summary.closing_dues)}</td>
                        <td className="p-3">
                          <StatusBadge status={r.person.status} />
                        </td>
                        <td className="p-2 whitespace-nowrap">
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
                        <td className="p-3 text-right num">{fmt(r.summary.opening_dues)}</td>
                        <td className="p-3 text-right num">{fmt(r.summary.sales_target)}</td>
                        <td className={`p-3 text-right num ${achvClass(r.summary.sales_achievement, r.summary.sales_target)}`}>
                          {fmt(r.summary.sales_achievement)}
                        </td>
                        <td className="p-3 text-right num">{fmt(r.summary.collection_target)}</td>
                        <td className={`p-3 text-right num ${achvClass(r.summary.collection_achievement, r.summary.collection_target)}`}>
                          {fmt(r.summary.collection_achievement)}
                        </td>
                        <td className="p-3 text-right num">{fmt(r.summary.collection_gap)}</td>
                        <td className="p-3 text-right num">{fmt(r.summary.sales_return)}</td>
                        <td className="p-3 text-right num">{fmt(r.summary.other_transaction)}</td>
                        <td className="p-3 text-right num">{fmt(r.summary.net_sales)}</td>
                        <td className="p-3 text-right num">
                          {fmt(r.summary.dues_recovery)}
                        </td>
                        <td className="p-3 text-right num">{fmt(r.summary.closing_dues)}</td>
                        <td className="p-3">
                          <StatusBadge status={r.person.status} />
                        </td>
                        <td className="p-2 whitespace-nowrap space-x-2">
                          <button
                            onClick={() => startEdit(r)}
                            className="text-xs text-blue-600 underline"
                          >
                            Edit Targets
                          </button>
                          <button
                            disabled={busyId === r.person.id}
                            onClick={() => togglePause(r.person)}
                            className={`text-xs underline ${
                              r.person.status === "paused"
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {r.person.status === "paused" ? "Resume" : "Pause"}
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
                  <td className="p-3 text-right num">-</td>
                  <td className="p-3 text-right num">{fmt(grandTotal.sales_target)}</td>
                  <td className="p-3 text-right num">{fmt(grandTotal.sales_achievement)}</td>
                  <td className="p-3 text-right num">{fmt(grandTotal.collection_target)}</td>
                  <td className="p-3 text-right num">{fmt(grandTotal.collection_achievement)}</td>
                  <td className="p-3 text-right num">{fmt(grandTotal.collection_gap)}</td>
                  <td className="p-3 text-right num">{fmt(grandTotal.sales_return)}</td>
                  <td className="p-3 text-right num">{fmt(grandTotal.other_transaction)}</td>
                  <td className="p-3 text-right num">{fmt(grandTotal.net_sales)}</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ---------- MOBILE / TABLET: stacked cards ---------- */}
          <div className="lg:hidden space-y-3">
            {rows.map((r) => (
              <div key={r.person.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Link
                      href={`/admin/employee/${r.person.id}?month=${month}`}
                      className="font-semibold text-blue-600 hover:underline"
                    >
                      {r.person.full_name}
                    </Link>
                    <p className="text-xs text-gray-500">{r.person.location}</p>
                  </div>
                  <StatusBadge status={r.person.status} />
                </div>

                {editingId === r.person.id ? (
                  <div className="space-y-2">
                    <LabeledInput
                      label="Opening Dues"
                      value={editForm.opening_dues}
                      onChange={(v) => setEditForm({ ...editForm, opening_dues: v })}
                    />
                    <LabeledInput
                      label="Sales Target"
                      value={editForm.sales_target}
                      onChange={(v) => setEditForm({ ...editForm, sales_target: v })}
                    />
                    <LabeledInput
                      label="Collection Target"
                      value={editForm.collection_target}
                      onChange={(v) => setEditForm({ ...editForm, collection_target: v })}
                    />
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => saveTarget(r.person.id)}
                        className="bg-black text-white rounded px-4 py-2 text-sm flex-1"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="border rounded px-4 py-2 text-sm flex-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                      <StatRow label="Opening Dues" value={fmt(r.summary.opening_dues)} />
                      <StatRow label="Sales Target" value={fmt(r.summary.sales_target)} />
                      <StatRow
                        label="Sales Achv."
                        value={fmt(r.summary.sales_achievement)}
                        warn={r.summary.sales_achievement < r.summary.sales_target}
                        good={r.summary.sales_achievement > r.summary.sales_target}
                      />
                      <StatRow
                        label="Collection Target"
                        value={fmt(r.summary.collection_target)}
                      />
                      <StatRow
                        label="Collection Achv."
                        value={fmt(r.summary.collection_achievement)}
                        warn={r.summary.collection_achievement < r.summary.collection_target}
                        good={r.summary.collection_achievement > r.summary.collection_target}
                      />
                      <StatRow label="Gap" value={fmt(r.summary.collection_gap)} />
                      <StatRow label="Sales Return" value={fmt(r.summary.sales_return)} />
                      <StatRow label="Other Tran." value={fmt(r.summary.other_transaction)} />
                      <StatRow label="Net Sales" value={fmt(r.summary.net_sales)} bold />
                      <StatRow
                        label="Dues Recovery"
                        value={fmt(r.summary.dues_recovery)}
                      />
                      <StatRow
                        label="Closing Dues"
                        value={fmt(r.summary.closing_dues)}
                        bold
                      />
                    </div>
                    <div className="flex gap-4 pt-2 border-t">
                      <button
                        onClick={() => startEdit(r)}
                        className="text-sm text-blue-600 underline"
                      >
                        Edit Targets
                      </button>
                      <button
                        disabled={busyId === r.person.id}
                        onClick={() => togglePause(r.person)}
                        className={`text-sm underline ${
                          r.person.status === "paused" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {r.person.status === "paused" ? "Resume Access" : "Pause Access"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Grand total card */}
            <div className="bg-gray-900 text-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="font-semibold mb-2">Grand Total</p>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <StatRow label="Sales Target" value={fmt(grandTotal.sales_target)} dark />
                <StatRow
                  label="Sales Achv."
                  value={fmt(grandTotal.sales_achievement)}
                  dark
                />
                <StatRow
                  label="Collection Target"
                  value={fmt(grandTotal.collection_target)}
                  dark
                />
                <StatRow
                  label="Collection Achv."
                  value={fmt(grandTotal.collection_achievement)}
                  dark
                />
                <StatRow label="Gap" value={fmt(grandTotal.collection_gap)} dark />
                <StatRow
                  label="Sales Return"
                  value={fmt(grandTotal.sales_return)}
                  dark
                />
                <StatRow
                  label="Other Tran."
                  value={fmt(grandTotal.other_transaction)}
                  dark
                />
                <StatRow label="Net Sales" value={fmt(grandTotal.net_sales)} dark bold />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Returns a red highlight if achievement is below target, green if
 * above, or nothing if it's on target - purely visual, never affects
 * any calculation. */
function achvClass(achievement, target) {
  if (achievement < target) return "text-red-600 font-medium bg-red-50";
  if (achievement > target) return "text-green-600 font-medium bg-green-50";
  return "";
}

function StatusBadge({ status }) {
  const styles = {
    approved: "bg-green-100 text-green-700",
    paused: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span
      className={`text-xs px-2 py-1 rounded-full font-medium ${
        styles[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {status === "paused" ? "Paused" : "Active"}
    </span>
  );
}

function StatRow({ label, value, bold, dark, warn, good }) {
  return (
    <>
      <span
        className={
          warn ? "text-red-600" : good ? "text-green-600" : dark ? "text-gray-300" : "text-gray-500"
        }
      >
        {label}
        {warn && " ⚠"}
        {good && " ✓"}
      </span>
      <span
        className={`text-right num ${bold ? "font-semibold" : ""} ${
          warn ? "text-red-600 font-medium" : good ? "text-green-600 font-medium" : ""
        }`}
      >
        {value}
      </span>
    </>
  );
}

function LabeledInput({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="number"
        className="w-full border rounded px-3 py-2 mt-0.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
