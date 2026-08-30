"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { summarizeMonth, fmt, monthKey } from "@/lib/calculations";
import DailyEntryForm from "@/components/DailyEntryForm";
import DailyEntriesTable from "@/components/DailyEntriesTable";

export default function SalesDashboard() {
  const supabase = createClient();
  const [userId, setUserId] = useState(null);
  const [month, setMonth] = useState(monthKey());
  const [target, setTarget] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState(null);

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
        <SummaryCard label="Dues Recovery" value={fmt(summary.dues_recovery)} />
        <SummaryCard label="Closing Dues" value={fmt(summary.closing_dues)} highlight />
      </div>

      {userId && (
        <DailyEntryForm
          userId={userId}
          editingEntry={editingEntry}
          onSaved={() => {
            setEditingEntry(null);
            load();
          }}
          onCancelEdit={() => setEditingEntry(null)}
        />
      )}

      <div>
        <h2 className="font-semibold mb-2 text-sm text-gray-600">
          Entry History{" "}
          <span className="font-normal text-gray-400">
            (rows in red have been edited after first saving)
          </span>
        </h2>
        <DailyEntriesTable
          entries={entries}
          loading={loading}
          onEdit={(entry) => {
            setEditingEntry(entry);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
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
