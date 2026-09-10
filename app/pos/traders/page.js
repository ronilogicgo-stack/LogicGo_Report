"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { TRADER_TYPES } from "@/lib/pos";
import { usePosAccess } from "../layout";

export default function PosTradersPage() {
  const supabase = createClient();
  const { canEdit } = usePosAccess();
  const [activeType, setActiveType] = useState("customer");
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function blankForm() {
    return { name: "", phone: "", email: "", address: "", notes: "" };
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pos_traders")
      .select("*")
      .eq("trader_type", activeType)
      .order("name");
    setTraders(data || []);
    setLoading(false);
  }, [supabase, activeType]);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId(null);
    setForm(blankForm());
    setShowForm(true);
  }

  function startEdit(t) {
    setEditingId(t.id);
    setForm({
      name: t.name || "",
      phone: t.phone || "",
      email: t.email || "",
      address: t.address || "",
      notes: t.notes || "",
    });
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { error: saveError } = editingId
      ? await supabase.from("pos_traders").update(form).eq("id", editingId)
      : await supabase
          .from("pos_traders")
          .insert({ ...form, trader_type: activeType, created_by: session?.user?.id || null });

    if (saveError) {
      setError(saveError.message);
    } else {
      setShowForm(false);
      load();
    }
    setSaving(false);
  }

  async function remove(id) {
    if (!confirm("Delete this record? This is blocked if they have any invoices.")) return;
    const { error: deleteError } = await supabase.from("pos_traders").delete().eq("id", id);
    if (deleteError) {
      alert(`Could not delete: ${deleteError.message}`);
      return;
    }
    load();
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold">Traders</h1>
        {canEdit && (
          <button onClick={startNew} className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm">
            + New {TRADER_TYPES.find((t) => t.value === activeType)?.label}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {TRADER_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => {
              setActiveType(t.value);
              setShowForm(false);
            }}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              activeType === t.value ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-3">
          <h2 className="font-semibold">
            {editingId ? "Edit" : "New"} {TRADER_TYPES.find((t) => t.value === activeType)?.label}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Input label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          </div>
          <Input label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button disabled={saving} className="bg-black text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border rounded-lg px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : traders.length === 0 ? (
        <p className="text-slate-500">No records yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y">
          {traders.map((t) => (
            <div key={t.id} className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-slate-500">
                  {[t.phone, t.email, t.address].filter(Boolean).join(" · ") || "No contact info"}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => startEdit(t)} className="text-xs text-blue-600 underline">
                    Edit
                  </button>
                  <button onClick={() => remove(t.id)} className="text-xs text-red-600 underline">
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type="text"
        className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
