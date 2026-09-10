"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { fmt, dateKey } from "@/lib/calculations";
import { sumItems } from "@/lib/pos";

let itemSeq = 0;
function blankItem() {
  itemSeq += 1;
  return { key: `new-${itemSeq}`, product_id: "", description: "", quantity: 1, rate: 0, maxStock: null };
}

export default function NewSalePage() {
  const supabase = createClient();
  const router = useRouter();

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [traderId, setTraderId] = useState("");
  const [saleType, setSaleType] = useState("cash");
  const [invoiceDate, setInvoiceDate] = useState(dateKey());
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([blankItem()]);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    const [{ data: cust }, { data: prod }] = await Promise.all([
      supabase.from("pos_traders").select("id, name").eq("trader_type", "customer").order("name"),
      supabase.from("pos_products").select("id, name, sales_price, current_stock, unit").order("name"),
    ]);
    setCustomers(cust || []);
    setProducts(prod || []);
    setLoadingData(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updateItem(key, field, value) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const updated = { ...it, [field]: value };
        if (field === "product_id") {
          const product = products.find((p) => p.id === value);
          if (product) {
            updated.description = product.name;
            updated.rate = product.sales_price;
            updated.maxStock = product.current_stock;
          } else {
            updated.maxStock = null;
          }
        }
        return updated;
      })
    );
  }

  function addItem() {
    setItems((prev) => [...prev, blankItem()]);
  }

  function removeItem(key) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  const subtotal = sumItems(items);
  const total = subtotal - Number(discount || 0) + Number(tax || 0);

  const overStock = items.find(
    (it) => it.maxStock !== null && Number(it.quantity) > Number(it.maxStock)
  );

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!traderId) {
      setError("Please select a customer.");
      return;
    }
    const cleanItems = items.filter((it) => it.product_id && Number(it.quantity) > 0);
    if (cleanItems.length === 0) {
      setError("Add at least one product line.");
      return;
    }
    if (overStock) {
      setError(`Not enough stock for "${overStock.description}" (only ${overStock.maxStock} left).`);
      return;
    }

    setSaving(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    const { data: invoice, error: invError } = await supabase
      .from("pos_sales_invoices")
      .insert({
        trader_id: traderId,
        sale_type: saleType,
        invoice_date: invoiceDate,
        subtotal,
        discount: Number(discount) || 0,
        tax: Number(tax) || 0,
        paid_amount: saleType === "cash" ? total : Number(paidAmount) || 0,
        notes,
        created_by: userId,
      })
      .select()
      .single();

    if (invError) {
      setError(invError.message);
      setSaving(false);
      return;
    }

    const { error: itemsError } = await supabase.from("pos_sales_invoice_items").insert(
      cleanItems.map((it, idx) => ({
        invoice_id: invoice.id,
        product_id: it.product_id,
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

    // Deduct stock for each line item via the ledger (the DB trigger
    // updates pos_products.current_stock automatically).
    const { error: stockError } = await supabase.from("pos_stock_ledger").insert(
      cleanItems.map((it) => ({
        product_id: it.product_id,
        change_qty: -Number(it.quantity),
        reference_type: "sale",
        reference_id: invoice.id,
        note: `Sale ${invoice.invoice_no}`,
        created_by: userId,
      }))
    );

    if (stockError) {
      setError(`Invoice saved but stock update failed: ${stockError.message}`);
      setSaving(false);
      return;
    }

    router.push(`/pos/sales/${invoice.id}`);
  }

  return (
    <form onSubmit={save} className="space-y-4 max-w-3xl mx-auto">
      <h1 className="text-lg sm:text-xl font-bold">New Sale</h1>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Customer *</label>
            <select
              required
              className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
              value={traderId}
              onChange={(e) => setTraderId(e.target.value)}
              disabled={loadingData}
            >
              <option value="">Select...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Sale Type</label>
            <div className="flex gap-2 mt-0.5">
              <button
                type="button"
                onClick={() => setSaleType("cash")}
                className={`flex-1 text-sm border rounded-lg px-3 py-2 ${
                  saleType === "cash" ? "bg-slate-900 text-white border-slate-900" : "bg-white"
                }`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setSaleType("credit")}
                className={`flex-1 text-sm border rounded-lg px-3 py-2 ${
                  saleType === "credit" ? "bg-slate-900 text-white border-slate-900" : "bg-white"
                }`}
              >
                Credit
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Invoice Date</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
          {saleType === "credit" && (
            <div>
              <label className="text-xs text-slate-500">Amount Received Now</label>
              <input
                type="number"
                className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-2">Products</p>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.key} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                <select
                  className="flex-1 min-w-[160px] border rounded-lg px-3 py-2 text-sm"
                  value={it.product_id}
                  onChange={(e) => updateItem(it.key, "product_id", e.target.value)}
                >
                  <option value="">Select product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.current_stock} {p.unit} left)
                    </option>
                  ))}
                </select>
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
                <button type="button" onClick={() => removeItem(it.key)} className="text-red-600 text-xs px-2">
                  ✕
                </button>
              </div>
            ))}
          </div>
          {overStock && (
            <p className="text-sm text-red-600 mt-2">
              Not enough stock for "{overStock.description}" — only {overStock.maxStock} left.
            </p>
          )}
          <button type="button" onClick={addItem} className="text-sm text-blue-600 underline mt-2">
            + Add product line
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
            disabled={saving || loadingData}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Create Invoice"}
          </button>
        </div>
      </div>
    </form>
  );
}
