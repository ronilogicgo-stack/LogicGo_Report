"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { fmt, dateKey } from "@/lib/calculations";
import { advanceDate, sumItems } from "@/lib/billing";

let itemSeq = 0;
function blankItem() {
  itemSeq += 1;
  return { key: `new-${itemSeq}`, description: "", quantity: 1, rate: 0 };
}

export default function NewInvoicePage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClient = searchParams.get("client") || "";

  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [clientId, setClientId] = useState(preselectedClient);
  const [billingType, setBillingType] = useState("one_time");
  const [recurringInterval, setRecurringInterval] = useState("monthly");
  const [invoiceDate, setInvoiceDate] = useState(dateKey());
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([blankItem()]);

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    const { data } = await supabase.from("billing_clients").select("id, name").order("name");
    setClients(data || []);
    setLoadingClients(false);
  }, [supabase]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  function updateItem(key, field, value) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, blankItem()]);
  }

  function removeItem(key) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  const subtotal = sumItems(items);
  const total = subtotal - Number(discount || 0) + Number(tax || 0);

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!clientId) {
      setError("Please select a client.");
      return;
    }
    const cleanItems = items.filter((it) => it.description.trim() || Number(it.quantity) > 0);
    if (cleanItems.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    if (billingType === "recurring" && !recurringInterval) {
      setError("Choose a recurring interval.");
      return;
    }

    setSaving(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { data: invoice, error: invError } = await supabase
      .from("billing_invoices")
      .insert({
        client_id: clientId,
        billing_type: billingType,
        recurring_interval: billingType === "recurring" ? recurringInterval : null,
        next_billing_date:
          billingType === "recurring" ? advanceDate(invoiceDate, recurringInterval) : null,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        subtotal,
        discount: Number(discount) || 0,
        tax: Number(tax) || 0,
        notes,
        created_by: session?.user?.id || null,
      })
      .select()
      .single();

    if (invError) {
      setError(invError.message);
      setSaving(false);
      return;
    }

    const { error: itemsError } = await supabase.from("billing_invoice_items").insert(
      cleanItems.map((it, idx) => ({
        invoice_id: invoice.id,
        description: it.description,
        quantity: Number(it.quantity) || 0,
        rate: Number(it.rate) || 0,
        sort_order: idx,
      }))
    );

    if (itemsError) {
      setError(itemsError.message);
      setSaving(false);
      return;
    }

    router.push(`/billing/invoices/${invoice.id}`);
  }

  return (
    <form onSubmit={save} className="space-y-4 max-w-3xl mx-auto">
      <h1 className="text-lg sm:text-xl font-bold">New Invoice</h1>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Client *</label>
            <select
              required
              className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={loadingClients}
            >
              <option value="">Select...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Billing Type</label>
            <div className="flex gap-2 mt-0.5">
              <button
                type="button"
                onClick={() => setBillingType("one_time")}
                className={`flex-1 text-sm border rounded-lg px-3 py-2 ${
                  billingType === "one_time" ? "bg-slate-900 text-white border-slate-900" : "bg-white"
                }`}
              >
                One-time
              </button>
              <button
                type="button"
                onClick={() => setBillingType("recurring")}
                className={`flex-1 text-sm border rounded-lg px-3 py-2 ${
                  billingType === "recurring" ? "bg-slate-900 text-white border-slate-900" : "bg-white"
                }`}
              >
                Recurring
              </button>
            </div>
          </div>

          {billingType === "recurring" && (
            <div>
              <label className="text-xs text-slate-500">Repeats</label>
              <select
                className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
                value={recurringInterval}
                onChange={(e) => setRecurringInterval(e.target.value)}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500">Invoice Date</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Due Date</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-2">Line Items (products / services)</p>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.key} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                <input
                  type="text"
                  placeholder="Description"
                  className="flex-1 min-w-[140px] border rounded-lg px-3 py-2 text-sm"
                  value={it.description}
                  onChange={(e) => updateItem(it.key, "description", e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Qty"
                  className="w-20 border rounded-lg px-3 py-2 text-sm"
                  value={it.quantity}
                  onChange={(e) => updateItem(it.key, "quantity", e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Rate"
                  className="w-28 border rounded-lg px-3 py-2 text-sm"
                  value={it.rate}
                  onChange={(e) => updateItem(it.key, "rate", e.target.value)}
                />
                <span className="w-24 text-right text-sm num">
                  {fmt((Number(it.quantity) || 0) * (Number(it.rate) || 0))}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(it.key)}
                  className="text-red-600 text-xs px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="text-sm text-blue-600 underline mt-2"
          >
            + Add line item
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Discount</label>
            <input
              type="number"
              className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Tax</label>
            <input
              type="number"
              className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500">Notes</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="border-t pt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <span className="num">{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between font-semibold text-base">
            <span>Total</span>
            <span className="num">{fmt(total)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            disabled={saving}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Create Invoice"}
          </button>
        </div>
      </div>
    </form>
  );
}
