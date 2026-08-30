"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabaseClient";
import { netSales, dailyCollectionGap, fmt } from "@/lib/calculations";
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
  entry_date: todayStr(),
  sales: "",
  collections: "",
  sales_return: "",
  remarks: "",
};

/**
 * Shared daily-entry form used by BOTH the Sales Person's own dashboard
 * and the Admin's per-employee detail page. Whoever submits it, the
 * write always targets `userId` - so an Admin can edit on behalf of
 * any sales person using the exact same code path (and the exact same
 * validation / calculation rules) as the sales person editing themselves.
 *
 * Pass `editingEntry` to pre-fill the form for editing an existing day
 * (clicking "Edit" on a history row) instead of adding a brand new one.
 */
export default function DailyEntryForm({ userId, editingEntry, onSaved, onCancelEdit }) {
  const supabase = createClient();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editingEntry) {
      setForm({
        entry_date: editingEntry.entry_date,
        sales: editingEntry.sales ?? "",
        collections: editingEntry.collections ?? "",
        sales_return: editingEntry.sales_return ?? "",
        remarks: editingEntry.remarks ?? "",
      });
    }
  }, [editingEntry]);

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
        upsertError.message.includes("row-level security") ||
          upsertError.message.includes("pending admin approval")
          ? "Your account is currently locked (paused, or an email change is pending admin approval). Contact your admin."
          : upsertError.message
      );
    } else {
      setForm(emptyForm);
      onSaved?.();
    }
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-xl shadow p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">
          {editingEntry ? `Editing entry: ${editingEntry.entry_date}` : "Add / Update Daily Entry"}
        </h2>
        {editingEntry && (
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm);
              onCancelEdit?.();
            }}
            className="text-xs text-gray-500 underline"
          >
            Cancel edit
          </button>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded p-2 mb-3">{error}</div>
      )}

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
      >
        <input
          type="date"
          required
          disabled={!!editingEntry}
          className="border rounded-lg px-3 py-2 text-base disabled:bg-gray-100"
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
              {fmt(dailyCollectionGap(form.sales, form.sales_return, form.collections))}
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
            {saving ? "Saving..." : editingEntry ? "Update Entry" : "Save Entry"}
          </button>
        </div>
      </form>
    </div>
  );
}
