"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { fmt } from "@/lib/calculations";
import { STATUS_STYLES, statusLabel, isOverdue, advanceDate } from "@/lib/billing";
import { useBillingAccess } from "../../layout";

export default function InvoiceDetailPage() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams();
  const { canEdit } = useBillingAccess();

  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paidInput, setPaidInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: inv }, { data: itemRows }] = await Promise.all([
      supabase
        .from("billing_invoices")
        .select("*, billing_clients:client_id(id, name, phone, email, address)")
        .eq("id", id)
        .single(),
      supabase.from("billing_invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    ]);
    setInvoice(inv || null);
    setItems(itemRows || []);
    setPaidInput(inv ? String(inv.paid_amount) : "");
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(status) {
    setBusy(true);
    const { error: updateError } = await supabase
      .from("billing_invoices")
      .update({ status })
      .eq("id", id);
    setBusy(false);
    if (updateError) {
      alert(`Could not update status: ${updateError.message}`);
      return;
    }
    load();
  }

  async function savePayment(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const amount = Number(paidInput) || 0;
    const { error: updateError } = await supabase
      .from("billing_invoices")
      .update({ paid_amount: amount, status: amount >= invoice.total ? "paid" : invoice.status })
      .eq("id", id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    load();
  }

  async function generateNext() {
    if (!confirm(`Create the next ${invoice.recurring_interval} invoice for this client now?`)) return;
    setBusy(true);
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const nextDate = invoice.next_billing_date || advanceDate(invoice.invoice_date, invoice.recurring_interval);

    const { data: newInvoice, error: invError } = await supabase
      .from("billing_invoices")
      .insert({
        client_id: invoice.client_id,
        billing_type: "recurring",
        recurring_interval: invoice.recurring_interval,
        next_billing_date: advanceDate(nextDate, invoice.recurring_interval),
        invoice_date: nextDate,
        due_date: invoice.due_date
          ? advanceDate(invoice.due_date, invoice.recurring_interval)
          : null,
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        tax: invoice.tax,
        notes: invoice.notes,
        created_by: session?.user?.id || null,
      })
      .select()
      .single();

    if (invError) {
      setError(invError.message);
      setBusy(false);
      return;
    }

    const { error: itemsError } = await supabase.from("billing_invoice_items").insert(
      items.map((it) => ({
        invoice_id: newInvoice.id,
        description: it.description,
        quantity: it.quantity,
        rate: it.rate,
        sort_order: it.sort_order,
      }))
    );

    if (itemsError) {
      setError(itemsError.message);
      setBusy(false);
      return;
    }

    // Advance this invoice's own next_billing_date so the button
    // reflects when the *following* one will be due.
    await supabase
      .from("billing_invoices")
      .update({ next_billing_date: advanceDate(nextDate, invoice.recurring_interval) })
      .eq("id", id);

    setBusy(false);
    router.push(`/billing/invoices/${newInvoice.id}`);
  }

  async function removeInvoice() {
    if (!confirm("Delete this invoice permanently? This cannot be undone.")) return;
    setBusy(true);
    const { error: deleteError } = await supabase.from("billing_invoices").delete().eq("id", id);
    setBusy(false);
    if (deleteError) {
      alert(`Could not delete: ${deleteError.message}`);
      return;
    }
    router.push("/billing");
  }

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (!invoice) return <p className="text-slate-500">Invoice not found.</p>;

  const overdue = isOverdue(invoice);

  return (
    <div className="space-y-4 max-w-3xl mx-auto print-area">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">{invoice.invoice_no}</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              overdue ? STATUS_STYLES.overdue : STATUS_STYLES[invoice.status]
            }`}
          >
            {overdue ? "Overdue" : statusLabel(invoice.status)}
          </span>
        </div>
        <Link href="/billing" className="text-sm text-blue-600 underline">
          ← All Invoices
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Billed To</p>
            <p className="font-medium">{invoice.billing_clients?.name}</p>
            <p className="text-slate-500">
              {[invoice.billing_clients?.phone, invoice.billing_clients?.email, invoice.billing_clients?.address]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="sm:text-right">
            <p>
              <span className="text-slate-500">Invoice Date: </span>
              {invoice.invoice_date}
            </p>
            {invoice.due_date && (
              <p>
                <span className="text-slate-500">Due Date: </span>
                {invoice.due_date}
              </p>
            )}
            {invoice.billing_type === "recurring" && (
              <p>
                <span className="text-slate-500">Repeats: </span>
                {invoice.recurring_interval} (next: {invoice.next_billing_date})
              </p>
            )}
          </div>
        </div>

        <table className="w-full text-sm border-t pt-2">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Description</th>
              <th className="py-2 text-right num">Qty</th>
              <th className="py-2 text-right num">Rate</th>
              <th className="py-2 text-right num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right num">{it.quantity}</td>
                <td className="py-2 text-right num">{fmt(it.rate)}</td>
                <td className="py-2 text-right num">{fmt(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t pt-3 space-y-1 text-sm max-w-xs ml-auto">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <span className="num">{fmt(invoice.subtotal)}</span>
          </div>
          {invoice.discount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Discount</span>
              <span className="num">-{fmt(invoice.discount)}</span>
            </div>
          )}
          {invoice.tax > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Tax</span>
              <span className="num">+{fmt(invoice.tax)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-base border-t pt-1">
            <span>Total</span>
            <span className="num">{fmt(invoice.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Paid</span>
            <span className="num">{fmt(invoice.paid_amount)}</span>
          </div>
          <div className="flex justify-between font-medium text-red-600">
            <span>Due</span>
            <span className="num">{fmt(invoice.due_amount)}</span>
          </div>
        </div>

        {invoice.notes && (
          <div className="border-t pt-3 text-sm">
            <p className="text-xs text-slate-500 mb-1">Notes</p>
            <p>{invoice.notes}</p>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4 no-print">
          <div>
            <p className="text-xs text-slate-500 mb-2">Update Status</p>
            <div className="flex flex-wrap gap-2">
              {["draft", "sent", "paid", "cancelled"].map((s) => (
                <button
                  key={s}
                  disabled={busy}
                  onClick={() => setStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50 ${
                    invoice.status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white"
                  }`}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={savePayment} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-slate-500">Amount Received</label>
              <input
                type="number"
                className="border rounded-lg px-3 py-2 text-sm w-40"
                value={paidInput}
                onChange={(e) => setPaidInput(e.target.value)}
              />
            </div>
            <button
              disabled={busy}
              className="bg-black text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              Save Payment
            </button>
          </form>

          {invoice.billing_type === "recurring" && (
            <div className="border-t pt-3">
              <button
                disabled={busy}
                onClick={generateNext}
                className="bg-violet-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              >
                {busy ? "Working..." : `Generate Next Invoice (${invoice.recurring_interval})`}
              </button>
              <p className="text-xs text-slate-500 mt-1">
                Creates a new one-off invoice with the same line items for {invoice.next_billing_date}.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="border-t pt-3">
            <button onClick={removeInvoice} disabled={busy} className="text-xs text-red-600 underline">
              Delete this invoice
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => window.print()}
        className="text-sm text-blue-600 underline no-print"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
