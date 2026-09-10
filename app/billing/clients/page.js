"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { useBillingAccess } from "../layout";

export default function BillingClientsPage() {
  const supabase = createClient();
  const { canEdit } = useBillingAccess();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("billing_clients").select("*").order("name");
    setClients(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId(null);
    setForm({ name: "", phone: "", email: "", address: "", notes: "" });
    setShowForm(true);
  }

  function startEdit(c) {
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      notes: c.notes || "",
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
    const payload = { ...form };
    const { error: saveError } = editingId
      ? await supabase.from("billing_clients").update(payload).eq("id", editingId)
      : await supabase.from("billing_clients").insert(payload);
    if (saveError) {
      setError(saveError.message);
    } else {
      setShowForm(false);
      load();
    }
    setSaving(false);
  }

  async function remove(id) {
    if (!confirm("Delete this client? This is blocked if they have any invoices.")) return;
    const { error: deleteError } = await supabase.from("billing_clients").delete().eq("id", id);
    if (deleteError) {
      alert(`Could not delete: ${deleteError.message}`);
      return;
    }
    load();
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold">Clients</h1>
        {canEdit && (
          <button
            onClick={startNew}
            className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm"
          >
            + New Client
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={save}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-3"
        >
          <h2 className="font-semibold">{editingId ? "Edit Client" : "New Client"}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LabeledInput label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <LabeledInput label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <LabeledInput label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <LabeledInput label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          </div>
          <LabeledInput label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
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
      ) : clients.length === 0 ? (
        <p className="text-slate-500">No clients yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y">
          {clients.map((c) => (
            <div key={c.id} className="p-4 flex items-center justify-between gap-3">
              <div>
                <Link
                  href={`/billing?client=${c.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {c.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {[c.phone, c.email, c.address].filter(Boolean).join(" · ") || "No contact info"}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => startEdit(c)} className="text-xs text-blue-600 underline">
                    Edit
                  </button>
                  <button onClick={() => remove(c.id)} className="text-xs text-red-600 underline">
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

function LabeledInput({ label, value, onChange }) {
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
