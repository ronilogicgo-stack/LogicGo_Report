"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { summarizeMonth, fmt, monthKey } from "@/lib/calculations";
import { downloadCSV } from "@/lib/csv";
import ExportButtons from "@/components/ExportButtons";
import DailyEntryForm from "@/components/DailyEntryForm";
import DailyEntriesTable from "@/components/DailyEntriesTable";

export default function EmployeeDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const employeeId = params.id;

  const [month, setMonth] = useState(searchParams.get("month") || monthKey());
  const [person, setPerson] = useState(null);
  const [target, setTarget] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);

    const monthEndDate = new Date(month);
    monthEndDate.setMonth(monthEndDate.getMonth() + 1);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    // None of these three queries depends on another - run them all at
    // once instead of one after another.
    const [{ data: p }, { data: t }, { data: e }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, location, status, email, avatar_url")
        .eq("id", employeeId)
        .single(),
      supabase
        .from("monthly_targets")
        .select("*")
        .eq("user_id", employeeId)
        .eq("month", month)
        .maybeSingle(),
      supabase
        .from("daily_entries")
        .select("*")
        .eq("user_id", employeeId)
        .gte("entry_date", month)
        .lt("entry_date", monthEnd)
        .order("entry_date", { ascending: false }),
    ]);

    setPerson(p);
    setTarget(t);
    setEntries(e || []);
    setLoading(false);
  }, [employeeId, month, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = summarizeMonth(entries, target);
  const reportedDays = entries.length;

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
    downloadCSV(
      `${(person?.full_name || "employee").replace(/\s+/g, "_")}_${month}.csv`,
      headers,
      csvRows
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-gray-500 hover:text-black mb-2"
        >
          ← Back to Dashboard
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            {person?.avatar_url ? (
              <img
                src={person.avatar_url}
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold text-lg">
                {person?.full_name?.[0]?.toUpperCase() || "?"}
              </div>
            )}
            <div>
              <h1 className="text-lg sm:text-xl font-bold">
                {person?.full_name || "Loading..."}
              </h1>
              <p className="text-sm text-gray-500">
                {person?.location} · {person?.email}
              </p>
            </div>
          </div>
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
      </div>

      <div className="print-area space-y-6">
        <p className="text-sm text-gray-600">
          Reported on <span className="font-semibold">{reportedDays}</span> day
          {reportedDays === 1 ? "" : "s"} this month.
        </p>

        {/* Monthly summary - identical calculation everywhere in the app */}
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
          <SummaryCard
            label="Dues Recovery"
            value={fmt(summary.dues_recovery)}
          />
          <SummaryCard label="Closing Dues" value={fmt(summary.closing_dues)} highlight />
        </div>

        <p className="text-xs text-gray-400 print:hidden">
          Editing here writes on behalf of this employee - it uses the exact
          same form and rules as their own dashboard. Edited entries are
          tracked and shown in red below.
        </p>

        {/* print:hidden - visible on screen, left out of the PDF/print
            output since it's an input form, not report data */}
        {person && (
          <div className="print:hidden">
            <DailyEntryForm
              userId={employeeId}
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
            Daily Report{" "}
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
