"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { fmt } from "@/lib/calculations";
import { usePosAccess } from "../../layout";

export default function PosInvoiceDetailPage() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams();
  const { canEdit } = usePosAccess();

  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [serialsByProduct, setSerialsByProduct] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paidInput, setPaidInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: inv }, { data: itemRows }] = await Promise.all([
      supabase
        .from("pos_sales_invoices")
        .select("*, pos_traders:trader_id(name, phone, address)")
        .eq("id", id)
        .single(),
      supabase.from("pos_sales_invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    ]);
    setInvoice(inv || null);
    setItems(itemRows || []);
    setPaidInput(inv ? String(inv.paid_amount) : "");

    const { data: soldSerials } = await supabase
      .from("pos_serial_numbers")
      .select("id, serial_no, product_id")
      .eq("sales_invoice_id", id);
    const grouped = {};
    for (const s of soldSerials || []) {
      if (!grouped[s.product_id]) grouped[s.product_id] = [];
      grouped[s.product_id].push(s);
    }
    setSerialsByProduct(grouped);

    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function savePayment(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase
      .from("pos_sales_invoices")
      .update({ paid_amount: Number(paidInput) || 0 })
      .eq("id", id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    load();
  }

  async function cancelInvoice() {
    if (!confirm("Cancel this invoice? The sold stock will be added back automatically.")) return;
    setBusy(true);
    setError("");
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Reverse every line item's stock deduction.
    const { error: reverseError } = await supabase.from("pos_stock_ledger").insert(
      items
        .filter((it) => it.product_id)
        .map((it) => ({
          product_id: it.product_id,
          change_qty: Number(it.quantity),
          reference_type: "sale_cancelled",
          reference_id: invoice.id,
          note: `Cancelled ${invoice.invoice_no}`,
          created_by: session?.user?.id || null,
        }))
    );

    if (reverseError) {
      setError(reverseError.message);
      setBusy(false);
      return;
    }

    // Restore any sold serial numbers back to in-stock.
    const allSoldSerialIds = Object.values(serialsByProduct).flatMap((list) => list.map((s) => s.id));
    if (allSoldSerialIds.length > 0) {
      const { error: serialRestoreError } = await supabase
        .from("pos_serial_numbers")
        .update({ status: "in_stock", sales_invoice_id: null, sold_at: null })
        .in("id", allSoldSerialIds);
      if (serialRestoreError) {
        setError(serialRestoreError.message);
        setBusy(false);
        return;
      }
    }

    const { error: statusError } = await supabase
      .from("pos_sales_invoices")
      .update({ status: "cancelled" })
      .eq("id", id);

    setBusy(false);
    if (statusError) {
      setError(statusError.message);
      return;
    }
    load();
  }

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (!invoice) return <p className="text-slate-500">Invoice not found.</p>;

  return (
    <div className="space-y-4 max-w-3xl mx-auto print-area">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">{invoice.invoice_no}</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              invoice.status === "cancelled"
                ? "bg-slate-200 text-slate-500 line-through"
                : "bg-green-100 text-green-700"
            }`}
          >
            {invoice.status === "cancelled" ? "Cancelled" : "Confirmed"}
          </span>
        </div>
        <Link href="/pos/sales" className="text-sm text-blue-600 underline">
          ← All Sales
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Customer</p>
            <p className="font-medium">{invoice.pos_traders?.name}</p>
            <p className="text-slate-500">
              {[invoice.pos_traders?.phone, invoice.pos_traders?.address].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="sm:text-right">
            <p>
              <span className="text-slate-500">Date: </span>
              {invoice.invoice_date}
            </p>
            <p className="capitalize">
              <span className="text-slate-500">Type: </span>
              {invoice.sale_type}
            </p>
          </div>
        </div>

        <table className="w-full text-sm border-t pt-2">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Product</th>
              <th className="py-2 text-right num">Qty</th>
              <th className="py-2 text-right num">Rate</th>
              <th className="py-2 text-right num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t align-top">
                <td className="py-2">
                  {it.description}
                  {serialsByProduct[it.product_id] && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {serialsByProduct[it.product_id].map((s) => (
                        <span
                          key={s.id}
                          className="text-[10px] font-mono bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded"
                        >
                          {s.serial_no}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
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

      {canEdit && invoice.status !== "cancelled" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4 no-print">
          {invoice.sale_type === "credit" && (
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
              <button disabled={busy} className="bg-black text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                Save Payment
              </button>
            </form>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="border-t pt-3">
            <button onClick={cancelInvoice} disabled={busy} className="text-xs text-red-600 underline">
              Cancel this invoice (returns stock)
            </button>
          </div>
        </div>
      )}

      <button onClick={() => window.print()} className="text-sm text-blue-600 underline no-print">
        Print / Save as PDF
      </button>
    </div>
  );
}
