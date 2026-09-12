"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { fmt, dateKey } from "@/lib/calculations";
import { sumItems } from "@/lib/pos";

let itemSeq = 0;
function blankItem() {
  itemSeq += 1;
  return {
    key: `new-${itemSeq}`,
    product_id: "",
    description: "",
    quantity: 1,
    rate: 0,
    maxStock: null,
    hasSerial: false,
    selectedSerialIds: [],
    scannedSerials: [], // [{ id, serial_no }] - only what THIS sale has scanned, never the whole stock list
  };
}

export default function NewSalePage() {
  const supabase = createClient();
  const router = useRouter();
  const scanInputRef = useRef(null);

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
  const [items, setItems] = useState([]);

  const [scanValue, setScanValue] = useState("");
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    const [{ data: cust }, { data: prod }] = await Promise.all([
      supabase.from("pos_traders").select("id, name").eq("trader_type", "customer").order("name"),
      supabase
        .from("pos_products")
        .select("id, name, sales_price, current_stock, unit, has_serial")
        .order("name"),
    ]);
    setCustomers(cust || []);
    setProducts(prod || []);
    setLoadingData(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Non-serialized products: manual "Select product" + quantity ---
  const nonSerialProducts = products.filter((p) => !p.has_serial);

  function updateItem(key, field, value) {
    if (field === "product_id") {
      const product = nonSerialProducts.find((p) => p.id === value);
      setItems((prev) =>
        prev.map((it) =>
          it.key === key
            ? {
                ...it,
                product_id: value,
                description: product?.name || "",
                rate: product?.sales_price || 0,
                maxStock: product?.current_stock ?? null,
              }
            : it
        )
      );
      return;
    }
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)));
  }

  function addManualItem() {
    setItems((prev) => [...prev, blankItem()]);
  }

  function removeItem(key) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  // --- Serialized products: scan or type a serial number, product is
  // auto-detected from it - no need to browse a product list at all. ---
  async function handleScanSubmit(e) {
    e.preventDefault();
    const serialNo = scanValue.trim();
    if (!serialNo) return;
    setScanError("");
    setScanning(true);

    const { data: serial, error: lookupError } = await supabase
      .from("pos_serial_numbers")
      .select("id, serial_no, product_id")
      .eq("serial_no", serialNo)
      .eq("status", "in_stock")
      .maybeSingle();

    setScanning(false);

    if (lookupError) {
      setScanError(lookupError.message);
      return;
    }
    if (!serial) {
      setScanError(`No in-stock unit found with serial "${serialNo}".`);
      return;
    }
    if (items.some((it) => it.selectedSerialIds.includes(serial.id))) {
      setScanError("That unit has already been added to this sale.");
      return;
    }

    const product = products.find((p) => p.id === serial.product_id);
    if (!product) {
      setScanError("Found the serial, but couldn't load its product.");
      return;
    }

    setItems((prev) => {
      const idx = prev.findIndex((it) => it.product_id === serial.product_id);
      if (idx >= 0) {
        const updated = [...prev];
        const it = updated[idx];
        updated[idx] = {
          ...it,
          selectedSerialIds: [...it.selectedSerialIds, serial.id],
          scannedSerials: [...it.scannedSerials, serial],
          quantity: it.selectedSerialIds.length + 1,
        };
        return updated;
      }
      return [
        ...prev,
        {
          key: blankItem().key,
          product_id: product.id,
          description: product.name,
          quantity: 1,
          rate: product.sales_price,
          maxStock: product.current_stock,
          hasSerial: true,
          selectedSerialIds: [serial.id],
          scannedSerials: [serial],
        },
      ];
    });

    setScanValue("");
    scanInputRef.current?.focus();
  }

  function removeScannedSerial(key, serialId) {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.key === key);
      if (idx < 0) return prev;
      const it = prev[idx];
      const selectedSerialIds = it.selectedSerialIds.filter((id) => id !== serialId);
      if (selectedSerialIds.length === 0) {
        return prev.filter((row) => row.key !== key);
      }
      const updated = [...prev];
      updated[idx] = {
        ...it,
        selectedSerialIds,
        scannedSerials: it.scannedSerials.filter((s) => s.id !== serialId),
        quantity: selectedSerialIds.length,
      };
      return updated;
    });
  }

  const subtotal = sumItems(items);
  const total = subtotal - Number(discount || 0) + Number(tax || 0);

  const overStock = items.find(
    (it) => !it.hasSerial && it.maxStock !== null && Number(it.quantity) > Number(it.maxStock)
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
      setError("Add at least one product - scan a serial number, or add a non-serialized product line.");
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

    // Mark every scanned serial number as sold, linked to this invoice.
    const serializedIds = cleanItems.flatMap((it) => (it.hasSerial ? it.selectedSerialIds : []));
    if (serializedIds.length > 0) {
      const { error: serialError } = await supabase
        .from("pos_serial_numbers")
        .update({ status: "sold", sales_invoice_id: invoice.id, sold_at: new Date().toISOString() })
        .in("id", serializedIds);
      if (serialError) {
        setError(`Invoice saved but marking serials as sold failed: ${serialError.message}`);
        setSaving(false);
        return;
      }
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

        {/* --- Scan / type a serial number: product is auto-detected --- */}
        <div className="border-2 border-dashed border-violet-300 bg-violet-50/50 rounded-lg p-3">
          <label className="text-xs font-medium text-violet-700">
            📷 Scan or Type Serial Number (for serialized products)
          </label>
          <div className="flex gap-2 mt-1">
            <input
              ref={scanInputRef}
              type="text"
              autoFocus
              placeholder="Scan barcode or type serial number, then press Enter"
              className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleScanSubmit(e);
              }}
            />
            <button
              type="button"
              onClick={handleScanSubmit}
              disabled={scanning}
              className="bg-violet-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {scanError && <p className="text-xs text-red-600 mt-1">{scanError}</p>}
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-2">Items in this sale</p>
          {items.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              Nothing added yet - scan a serial number above, or add a non-serialized product below.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.key} className="border rounded-lg p-2 space-y-1.5">
                  <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                    {it.hasSerial ? (
                      <span className="flex-1 min-w-[160px] text-sm font-medium">
                        {it.description}
                        <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                          Serial
                        </span>
                      </span>
                    ) : (
                      <select
                        className="flex-1 min-w-[160px] border rounded-lg px-3 py-2 text-sm"
                        value={it.product_id}
                        onChange={(e) => updateItem(it.key, "product_id", e.target.value)}
                      >
                        <option value="">Select product...</option>
                        {nonSerialProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.current_stock} {p.unit} left)
                          </option>
                        ))}
                      </select>
                    )}
                    {it.hasSerial ? (
                      <span className="w-20 text-center text-sm border rounded-lg px-3 py-2 bg-slate-50">
                        Qty: {it.quantity}
                      </span>
                    ) : (
                      <input
                        type="number"
                        placeholder="Qty"
                        className="w-20 border rounded-lg px-3 py-2 text-sm"
                        value={it.quantity}
                        onChange={(e) => updateItem(it.key, "quantity", e.target.value)}
                      />
                    )}
                    <input
                      type="number"
                      placeholder="Rate"
                      className="w-28 border rounded-lg px-3 py-2 text-sm"
                      value={it.rate}
                      onChange={(e) => updateItem(it.key, "rate", e.target.value)}
                      disabled={it.hasSerial}
                    />
                    <span className="w-24 text-right text-sm num">
                      {fmt((Number(it.quantity) || 0) * (Number(it.rate) || 0))}
                    </span>
                    <button type="button" onClick={() => removeItem(it.key)} className="text-red-600 text-xs px-2">
                      ✕
                    </button>
                  </div>
                  {it.hasSerial && (
                    <div className="flex flex-wrap gap-1.5 pl-1">
                      {it.scannedSerials.map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1 text-xs font-mono bg-violet-600 text-white px-2 py-0.5 rounded"
                        >
                          {s.serial_no}
                          <button
                            type="button"
                            onClick={() => removeScannedSerial(it.key, s.id)}
                            className="hover:text-violet-200"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {overStock && (
            <p className="text-sm text-red-600 mt-2">
              Not enough stock for "{overStock.description}" — only {overStock.maxStock} left.
            </p>
          )}
          <button type="button" onClick={addManualItem} className="text-sm text-blue-600 underline mt-2">
            + Add non-serialized product line
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
