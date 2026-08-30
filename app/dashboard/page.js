"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  summarizeMonth,
  netSales,
  dailyCollectionGap,
  fmt,
  monthKey,
} from "@/lib/calculations";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function SalesDashboard() {
  const supabase = createClient();
  const [userId, setUserId] = useState(null);
  const [month, setMonth] = useState(monthKey());
  const [target, setTarget] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    entry_date: todayStr(),
    sales: "",
    collections: "",
    sales_return: "",
    remarks: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    setUserId(session.user.id);

    const { data: t } = await supabase
      .from("monthly_targets")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("month", month)
      .maybeSingle();
    setTarget(t);

    const monthEndDate = new Date(month);
    monthEndDate.setMonth(monthEndDate.getMonth() + 1);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    const { data: e } = await supabase
      .from("daily_entries")
      .select("*")
      .eq("user_id", session.user.id)
      .gte("entry_date", month)
      .lt("entry_date", monthEnd)
      .order("entry_date", { ascending: false });
    setEntries(e || []);
    setLoading(false);
  }, [month, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const { error: upsertError } = await supabase.from("daily_entries").upsert(
      {
        user_id: userId,
        entry_date: form.entry_date,
        sales: Number(form.sales) || 0,
        collections: Number(form.collections) || 0,
        sales_return: Number(form.sales_return) || 0,
        remarks: form.remarks,
      },
      { onConflict: "user_id,entry_date" }
    );

    if (upsertError) {
      setError(
        upsertError.message.includes("row-level security")
          ? "Your account is paused. Contact your admin to resume access."
          : upsertError.message
      );
    } else {
      setForm({
        entry_date: todayStr(),
        sales: "",
        collections: "",
        sales_return: "",
        remarks: "",
      });
      load();
    }
    setSaving(false);
  }

  const summary = summarizeMonth(entries, target);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">My Dashboard</h1>
        <input
          type="month"
          value={month.slice(0, 7)}
          onChange={(e) => setMonth(`${e.target.value}-01`)}
          className="border rounded-lg px-3 py-2 w-full sm:w-auto"
        />
      </div>

      {/* Monthly summary - same calculation as admin dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
        <SummaryCard label="Opening Dues" value={fmt(summary.opening_dues)} />
        <SummaryCard label="Sales Target" value={fmt(summary.sales_target)} />
        <SummaryCard label="Sales Achievement" value={fmt(summary.sales_achievement)} />
        <SummaryCard label="Collection Target" value={fmt(summary.collection_target)} />
        <SummaryCard
          label="Collection Achievement"
          value={fmt(summary.collection_achievement)}
        />
        <SummaryCard label="Collection Gap" value={fmt(summary.collection_gap)} />
        <SummaryCard label="Sales Return" value={fmt(summary.sales_return)} />
        <SummaryCard label="Net Sales" value={fmt(summary.net_sales)} highlight />
        <SummaryCard
          label="Dues Recovery Target"
          value={fmt(summary.dues_recovery_target)}
        />
        <SummaryCard label="Closing Dues" value={fmt(summary.closing_dues)} highlight />
      </div>

      {/* Placeholder / entry form for today's (or any) daily data */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="font-semibold mb-4">Add / Update Daily Entry</h2>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded p-2 mb-3">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            type="date"
            required
            className="border rounded-lg px-3 py-2 text-base"
            value={form.entry_date}
            onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder="Sales"
            className="border rounded-lg px-3 py-2 text-base"
            value={form.sales}
            onChange={(e) => setForm({ ...form, sales: e.target.value })}
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder="Collections"
            className="border rounded-lg px-3 py-2 text-base"
            value={form.collections}
            onChange={(e) => setForm({ ...form, collections: e.target.value })}
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder="Sales Return"
            className="border rounded-lg px-3 py-2 text-base"
            value={form.sales_return}
            onChange={(e) => setForm({ ...form, sales_return: e.target.value })}
          />
          <input
            type="text"
            placeholder="Remarks"
            className="border rounded-lg px-3 py-2 text-base"
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          />
          <div className="col-span-1 sm:col-span-2 lg:col-span-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-500">
              Collection Gap:{" "}
              <span className="font-semibold">
                {fmt(dailyCollectionGap(form.sales, form.collections))}
              </span>
              {"  ·  "}
              Net Sales:{" "}
              <span className="font-semibold">
                {fmt(netSales(form.sales, form.sales_return))}
              </span>
            </p>
            <button
              disabled={saving}
              className="bg-black text-white rounded-lg px-5 py-2.5 text-sm disabled:opacity-50 w-full sm:w-auto"
            >
              {saving ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </form>
      </div>

      {/* History - table on desktop, cards on mobile */}
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-3 text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-3 text-gray-500">
                  No entries yet this month.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-3">{e.entry_date}</td>
                  <td className="p-3 text-right">{fmt(e.sales)}</td>
                  <td className="p-3 text-right">{fmt(e.collections)}</td>
                  <td className="p-3 text-right">{fmt(e.collection_gap)}</td>
                  <td className="p-3 text-right">{fmt(e.sales_return)}</td>
                  <td className="p-3 text-right">{fmt(e.net_sales)}</td>
                  <td className="p-3">{e.remarks}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-gray-500">No entries yet this month.</p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="bg-white rounded-xl shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold">{e.entry_date}</p>
                <p className="text-sm font-semibold">{fmt(e.net_sales)} Net</p>
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight }) {
  return (
    <div
      className={`rounded-xl shadow p-3 sm:p-4 ${
        highlight ? "bg-black text-white" : "bg-white"
      }`}
    >
      <p className={`text-xs ${highlight ? "text-gray-300" : "text-gray-500"}`}>{label}</p>
      <p className="text-base sm:text-lg font-bold mt-1">{value}</p>
    </div>
  );
}
