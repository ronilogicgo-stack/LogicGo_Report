"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { summarizeMonth, fmt, monthKey } from "@/lib/calculations";
import { downloadCSV } from "@/lib/csv";
import ExportButtons from "@/components/ExportButtons";
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

  const [editingTargets, setEditingTargets] = useState(false);
  const [targetForm, setTargetForm] = useState({
    opening_dues: 0,
    sales_target: 0,
    collection_target: 0,
  });
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetError, setTargetError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    setUserId(session.user.id);

    const monthEndDate = new Date(month);
    monthEndDate.setMonth(monthEndDate.getMonth() + 1);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    // These two don't depend on each other - run them at once.
    const [{ data: t }, { data: e }] = await Promise.all([
      supabase
        .from("monthly_targets")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("month", month)
        .maybeSingle(),
      supabase
        .from("daily_entries")
        .select("*")
        .eq("user_id", session.user.id)
        .gte("entry_date", month)
        .lt("entry_date", monthEnd)
        .order("entry_date", { ascending: false }),
    ]);

    setTarget(t);
    setEntries(e || []);
    setLoading(false);
  }, [month, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function startEditTargets() {
    setTargetForm({
      opening_dues: target?.opening_dues || 0,
      sales_target: target?.sales_target || 0,
      collection_target: target?.collection_target || 0,
    });
    setTargetError("");
    setEditingTargets(true);
  }

  async function saveTargets() {
    setSavingTargets(true);
    setTargetError("");
    const { error } = await supabase.from("monthly_targets").upsert(
      {
        user_id: userId,
        month,
        opening_dues: Number(targetForm.opening_dues) || 0,
        sales_target: Number(targetForm.sales_target) || 0,
        collection_target: Number(targetForm.collection_target) || 0,
      },
      { onConflict: "user_id,month" }
    );
    if (error) {
      setTargetError(
        error.message.includes("row-level security") ||
          error.message.includes("pending admin approval")
          ? "Your account is currently locked (paused, or an email change is pending admin approval). Contact your admin."
          : error.message
      );
    } else {
      setEditingTargets(false);
      load();
    }
    setSavingTargets(false);
  }

  const summary = summarizeMonth(entries, target);

  function exportCSV() {
    const headers = ["Date", "Sales", "Collections", "Collection Gap", "Sales Return", "Other Transaction", "Net Sales", "Remarks"];
    const csvRows = entries.map((e) => [
      e.entry_date,
      e.sales,
      e.collections,
      e.collection_gap,
      e.sales_return,
      e.other_transaction,
      e.net_sales,
      e.remarks || "",
    ]);
    downloadCSV(`my_sales_report_${month}.csv`, headers, csvRows);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">My Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(`${e.target.value}-01`)}
            className="border rounded-lg px-3 py-2 flex-1 sm:flex-none"
          />
          {!editingTargets && (
            <button
              onClick={startEditTargets}
              className="text-sm text-blue-600 underline whitespace-nowrap"
            >
              Edit My Targets
            </button>
          )}
          <ExportButtons onDownloadCSV={exportCSV} />
        </div>
      </div>

      {editingTargets && (
        <div className="bg-white rounded-xl shadow p-4 space-y-3">
          <h2 className="font-semibold text-sm">
            Set Opening Dues / Sales Target / Collection Target for this month
          </h2>
          {targetError && (
            <div className="text-sm text-red-600 bg-red-50 rounded p-2">
              {targetError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <LabeledNumberInput
              label="Opening Dues"
              value={targetForm.opening_dues}
              onChange={(v) => setTargetForm({ ...targetForm, opening_dues: v })}
            />
            <LabeledNumberInput
              label="Sales Target"
              value={targetForm.sales_target}
              onChange={(v) => setTargetForm({ ...targetForm, sales_target: v })}
            />
            <LabeledNumberInput
              label="Collection Target"
              value={targetForm.collection_target}
              onChange={(v) =>
                setTargetForm({ ...targetForm, collection_target: v })
              }
            />
          </div>
          <div className="flex gap-2">
            <button
              disabled={savingTargets}
              onClick={saveTargets}
              className="bg-black text-white rounded-lg px-5 py-2 text-sm disabled:opacity-50"
            >
              {savingTargets ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setEditingTargets(false)}
              className="border rounded-lg px-5 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Monthly summary - same calculation as admin dashboard */}
      <div className="print-area space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          <SummaryCard label="Opening Dues" value={fmt(summary.opening_dues)} />
          <SummaryCard label="Sales Target" value={fmt(summary.sales_target)} />
          <SummaryCard
            label="Sales Achievement"
            value={fmt(summary.sales_achievement)}
            belowTarget={summary.sales_achievement < summary.sales_target}
            aboveTarget={summary.sales_achievement > summary.sales_target}
          />
          <SummaryCard label="Collection Target" value={fmt(summary.collection_target)} />
          <SummaryCard
            label="Collection Achievement"
            value={fmt(summary.collection_achievement)}
            belowTarget={summary.collection_achievement < summary.collection_target}
            aboveTarget={summary.collection_achievement > summary.collection_target}
          />
          <SummaryCard label="Collection Gap" value={fmt(summary.collection_gap)} />
          <SummaryCard label="Sales Return" value={fmt(summary.sales_return)} />
          <SummaryCard label="Net Sales" value={fmt(summary.net_sales)} highlight />
          <SummaryCard label="Dues Recovery" value={fmt(summary.dues_recovery)} />
          <SummaryCard label="Closing Dues" value={fmt(summary.closing_dues)} highlight />
        </div>

        {/* print:hidden - visible on screen, but left out of the PDF/print
            output since it's an input form, not report data */}
        {userId && (
          <div className="print:hidden">
            <DailyEntryForm
              userId={userId}
              editingEntry={editingEntry}
              onSaved={() => {
                setEditingEntry(null);
                load();
              }}
              onCancelEdit={() => setEditingEntry(null)}
            />
          </div>
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
    </div>
  );
}

function SummaryCard({ label, value, highlight, belowTarget, aboveTarget }) {
  return (
    <div
      className={`rounded-xl shadow p-3 sm:p-4 ${
        belowTarget
          ? "bg-red-50 ring-1 ring-red-300"
          : aboveTarget
          ? "bg-green-50 ring-1 ring-green-300"
          : highlight
          ? "bg-black text-white"
          : "bg-white"
      }`}
    >
      <p
        className={`text-xs ${
          belowTarget
            ? "text-red-600"
            : aboveTarget
            ? "text-green-600"
            : highlight
            ? "text-gray-300"
            : "text-gray-500"
        }`}
      >
        {label}
      </p>
      <p
        className={`text-base sm:text-lg font-bold mt-1 ${
          belowTarget ? "text-red-700" : aboveTarget ? "text-green-700" : ""
        }`}
      >
        {value}
      </p>
      {belowTarget && (
        <p className="text-[11px] text-red-600 font-medium mt-0.5">Below target</p>
      )}
      {aboveTarget && (
        <p className="text-[11px] text-green-600 font-medium mt-0.5">Above target</p>
      )}
    </div>
  );
}

function LabeledNumberInput({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        className="w-full border rounded-lg px-3 py-2 mt-0.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
