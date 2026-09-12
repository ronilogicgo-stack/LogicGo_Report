"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { fmt } from "@/lib/calculations";
import { usePosAccess } from "../layout";

export default function PosProductsPage() {
  const supabase = createClient();
  const { canEdit } = usePosAccess();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [adjustingId, setAdjustingId] = useState(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  function blankForm() {
    return {
      sku: "",
      name: "",
      category: "",
      unit: "pcs",
      purchase_price: 0,
      sales_price: 0,
      opening_stock: 0,
      has_serial: false,
      opening_serials: "",
    };
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("pos_products").select("*").order("name");
    setProducts(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId(null);
    setForm(blankForm());
    setShowForm(true);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setForm({
      sku: p.sku || "",
      name: p.name,
      category: p.category || "",
      unit: p.unit || "pcs",
      purchase_price: p.purchase_price,
      sales_price: p.sales_price,
      opening_stock: 0,
      has_serial: p.has_serial,
      opening_serials: "",
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

    if (editingId) {
      const { error: updateError } = await supabase
        .from("pos_products")
        .update({
          sku: form.sku || null,
          name: form.name,
          category: form.category,
          unit: form.unit,
          purchase_price: Number(form.purchase_price) || 0,
          sales_price: Number(form.sales_price) || 0,
        })
        .eq("id", editingId);
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { data: newProduct, error: insertError } = await supabase
        .from("pos_products")
        .insert({
          sku: form.sku || null,
          name: form.name,
          category: form.category,
          unit: form.unit,
          purchase_price: Number(form.purchase_price) || 0,
          sales_price: Number(form.sales_price) || 0,
          has_serial: form.has_serial,
          created_by: session?.user?.id || null,
        })
        .select()
        .single();
      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      if (form.has_serial) {
        const serials = form.opening_serials
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (serials.length > 0) {
          const { error: serialError } = await supabase.from("pos_serial_numbers").insert(
            serials.map((serial_no) => ({
              product_id: newProduct.id,
              serial_no,
              created_by: session?.user?.id || null,
            }))
          );
          if (serialError) {
            setError(`Product created, but serials failed: ${serialError.message}`);
            setSaving(false);
            load();
            return;
          }
          await supabase.from("pos_stock_ledger").insert({
            product_id: newProduct.id,
            change_qty: serials.length,
            reference_type: "opening",
            note: "Opening stock (serialized)",
            created_by: session?.user?.id || null,
          });
        }
      } else {
        const opening = Number(form.opening_stock) || 0;
        if (opening !== 0) {
          await supabase.from("pos_stock_ledger").insert({
            product_id: newProduct.id,
            change_qty: opening,
            reference_type: "opening",
            note: "Opening stock",
            created_by: session?.user?.id || null,
          });
        }
      }
    }

    setShowForm(false);
    load();
    setSaving(false);
  }

  async function remove(id) {
    if (!confirm("Delete this product? This is blocked if it's used in any invoice.")) return;
    const { error: deleteError } = await supabase.from("pos_products").delete().eq("id", id);
    if (deleteError) {
      alert(`Could not delete: ${deleteError.message}`);
      return;
    }
    load();
  }

  async function saveAdjustment(e) {
    e.preventDefault();
    const qty = Number(adjustQty);
    if (!qty) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { error: adjError } = await supabase.from("pos_stock_ledger").insert({
      product_id: adjustingId,
      change_qty: qty,
      reference_type: "adjustment",
      note: adjustNote || "Manual adjustment",
      created_by: session?.user?.id || null,
    });
    if (adjError) {
      alert(`Could not adjust stock: ${adjError.message}`);
      return;
    }
    setAdjustingId(null);
    setAdjustQty("");
    setAdjustNote("");
    load();
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold">Products</h1>
        {canEdit && (
          <button onClick={startNew} className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm">
            + New Product
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-3">
          <h2 className="font-semibold">{editingId ? "Edit Product" : "New Product"}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Input label="SKU / Code" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} />
            <Input label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
            <Input label="Unit" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} />
            <Input
              label="Purchase Price"
              type="number"
              value={form.purchase_price}
              onChange={(v) => setForm({ ...form, purchase_price: v })}
            />
            <Input
              label="Sales Price"
              type="number"
              value={form.sales_price}
              onChange={(v) => setForm({ ...form, sales_price: v })}
            />
          </div>

          {!editingId && (
            <div className="border-t pt-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.has_serial}
                  onChange={(e) => setForm({ ...form, has_serial: e.target.checked })}
                />
                Track by Serial Number (e.g. IMEI for phones/gadgets) — each unit is tracked
                individually instead of just a quantity. Can't be changed after saving.
              </label>

              {form.has_serial ? (
                <div className="mt-2">
                  <label className="text-xs text-slate-500">
                    Opening Serial Numbers (one per line, optional)
                  </label>
                  <textarea
                    className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm font-mono"
                    rows={4}
                    placeholder={"e.g.\n351234567891234\n351234567891235"}
                    value={form.opening_serials}
                    onChange={(e) => setForm({ ...form, opening_serials: e.target.value })}
                  />
                </div>
              ) : (
                <div className="mt-2">
                  <Input
                    label="Opening Stock"
                    type="number"
                    value={form.opening_stock}
                    onChange={(v) => setForm({ ...form, opening_stock: v })}
                  />
                </div>
              )}
            </div>
          )}

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
      ) : products.length === 0 ? (
        <p className="text-slate-500">No products yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-right num">Purchase Price</th>
                <th className="p-3 text-right num">Sales Price</th>
                <th className="p-3 text-right num">Stock</th>
                {canEdit && <th className="p-3"></th>}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <Fragment key={p.id}>
                  <tr className="border-t">
                    <td className="p-3 font-medium">
                      {p.name}
                      {p.has_serial && (
                        <span className="ml-2 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full align-middle">
                          Serial Tracked
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-slate-500">{p.sku || "—"}</td>
                    <td className="p-3 text-slate-500">{p.category || "—"}</td>
                    <td className="p-3 text-right num">{fmt(p.purchase_price)}</td>
                    <td className="p-3 text-right num">{fmt(p.sales_price)}</td>
                    <td className={`p-3 text-right num ${p.current_stock <= 10 ? "text-red-600 font-medium" : ""}`}>
                      {p.current_stock} {p.unit}
                    </td>
                    {canEdit && (
                      <td className="p-2 whitespace-nowrap space-x-2">
                        {p.has_serial ? (
                          <Link
                            href={`/pos/products/${p.id}/serials`}
                            className="text-xs text-violet-600 underline"
                          >
                            Manage Serials
                          </Link>
                        ) : (
                          <button
                            onClick={() => setAdjustingId(adjustingId === p.id ? null : p.id)}
                            className="text-xs text-emerald-600 underline"
                          >
                            Adjust Stock
                          </button>
                        )}
                        <button onClick={() => startEdit(p)} className="text-xs text-blue-600 underline">
                          Edit
                        </button>
                        <button onClick={() => remove(p.id)} className="text-xs text-red-600 underline">
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                  {adjustingId === p.id && !p.has_serial && (
                    <tr className="bg-slate-50 border-t">
                      <td colSpan={7} className="p-3">
                        <form onSubmit={saveAdjustment} className="flex flex-wrap items-end gap-2">
                          <div>
                            <label className="text-xs text-slate-500">
                              Quantity (+ to add, - to remove)
                            </label>
                            <input
                              type="number"
                              className="border rounded-lg px-3 py-2 text-sm w-32"
                              value={adjustQty}
                              onChange={(e) => setAdjustQty(e.target.value)}
                            />
                          </div>
                          <div className="flex-1 min-w-[160px]">
                            <label className="text-xs text-slate-500">Note</label>
                            <input
                              type="text"
                              placeholder="e.g. Damaged stock, stock count correction"
                              className="w-full border rounded-lg px-3 py-2 text-sm"
                              value={adjustNote}
                              onChange={(e) => setAdjustNote(e.target.value)}
                            />
                          </div>
                          <button className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm">
                            Apply
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type={type}
        className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
