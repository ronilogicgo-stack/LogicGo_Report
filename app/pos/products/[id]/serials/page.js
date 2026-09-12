"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { usePosAccess } from "../../../layout";

const STATUS_STYLES = {
  in_stock: "bg-green-100 text-green-700",
  sold: "bg-blue-100 text-blue-700",
  returned: "bg-amber-100 text-amber-700",
  damaged: "bg-red-100 text-red-700",
};

function statusLabel(s) {
  return { in_stock: "In Stock", sold: "Sold", returned: "Returned", damaged: "Damaged" }[s] || s;
}

export default function ProductSerialsPage() {
  const supabase = createClient();
  const { id } = useParams();
  const { canEdit } = usePosAccess();

  const [product, setProduct] = useState(null);
  const [serials, setSerials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const [newSerials, setNewSerials] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from("pos_products").select("*").eq("id", id).single(),
      supabase
        .from("pos_serial_numbers")
        .select("*, pos_sales_invoices:sales_invoice_id(invoice_no)")
        .eq("product_id", id)
        .order("created_at", { ascending: false }),
    ]);
    setProduct(p || null);
    setSerials(s || []);
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addSerials(e) {
    e.preventDefault();
    setError("");
    const lines = newSerials
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setSaving(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { error: insertError } = await supabase.from("pos_serial_numbers").insert(
      lines.map((serial_no) => ({
        product_id: id,
        serial_no,
        created_by: session?.user?.id || null,
      }))
    );

    if (insertError) {
      setError(
        insertError.message.includes("duplicate")
          ? "One or more of these serial numbers already exist (serials must be unique)."
          : insertError.message
      );
      setSaving(false);
      return;
    }

    await supabase.from("pos_stock_ledger").insert({
      product_id: id,
      change_qty: lines.length,
      reference_type: "adjustment",
      note: "New serialized units received",
      created_by: session?.user?.id || null,
    });

    setNewSerials("");
    setSaving(false);
    load();
  }

  async function markDamaged(serialId) {
    if (!confirm("Mark this unit as damaged? It will be removed from sellable stock.")) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { error: updateError } = await supabase
      .from("pos_serial_numbers")
      .update({ status: "damaged" })
      .eq("id", serialId);
    if (updateError) {
      alert(`Could not update: ${updateError.message}`);
      return;
    }

    await supabase.from("pos_stock_ledger").insert({
      product_id: id,
      change_qty: -1,
      reference_type: "adjustment",
      note: "Unit marked damaged",
      created_by: session?.user?.id || null,
    });
    load();
  }

  async function restoreToStock(serialId) {
    const { error: updateError } = await supabase
      .from("pos_serial_numbers")
      .update({ status: "in_stock" })
      .eq("id", serialId);
    if (updateError) {
      alert(`Could not update: ${updateError.message}`);
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await supabase.from("pos_stock_ledger").insert({
      product_id: id,
      change_qty: 1,
      reference_type: "adjustment",
      note: "Unit restored to stock",
      created_by: session?.user?.id || null,
    });
    load();
  }

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (!product) return <p className="text-slate-500">Product not found.</p>;

  const filtered = serials.filter((s) => statusFilter === "all" || s.status === statusFilter);
  const counts = serials.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">{product.name} — Serial Numbers</h1>
          <p className="text-sm text-slate-500">
            {counts.in_stock || 0} in stock · {counts.sold || 0} sold · {counts.damaged || 0} damaged ·{" "}
            {counts.returned || 0} returned
          </p>
        </div>
        <Link href="/pos/products" className="text-sm text-blue-600 underline">
          ← All Products
        </Link>
      </div>

      {canEdit && (
        <form onSubmit={addSerials} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-2">
          <label className="text-xs text-slate-500">Add New Units (one serial number per line)</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            rows={3}
            placeholder={"e.g.\n351234567891236\n351234567891237"}
            value={newSerials}
            onChange={(e) => setNewSerials(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={saving} className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
            {saving ? "Adding..." : "Add to Stock"}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {["all", "in_stock", "sold", "damaged", "returned"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              statusFilter === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600"
            }`}
          >
            {s === "all" ? "All" : statusLabel(s)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-slate-500">No serial numbers here yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-3">Serial No.</th>
                <th className="p-3">Status</th>
                <th className="p-3">Sold In</th>
                <th className="p-3">Sold Date</th>
                {canEdit && <th className="p-3"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3 font-mono">{s.serial_no}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[s.status]}`}>
                      {statusLabel(s.status)}
                    </span>
                  </td>
                  <td className="p-3">
                    {s.pos_sales_invoices ? (
                      <Link
                        href={`/pos/sales/${s.sales_invoice_id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {s.pos_sales_invoices.invoice_no}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-slate-500">
                    {s.sold_at ? new Date(s.sold_at).toLocaleDateString() : "—"}
                  </td>
                  {canEdit && (
                    <td className="p-2 whitespace-nowrap">
                      {s.status === "in_stock" && (
                        <button onClick={() => markDamaged(s.id)} className="text-xs text-red-600 underline">
                          Mark Damaged
                        </button>
                      )}
                      {s.status === "damaged" && (
                        <button onClick={() => restoreToStock(s.id)} className="text-xs text-emerald-600 underline">
                          Restore to Stock
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
