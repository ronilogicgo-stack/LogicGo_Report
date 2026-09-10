"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { fmt } from "@/lib/calculations";
import { usePosAccess } from "../layout";

export default function PosSalesPage() {
  const supabase = createClient();
  const { canEdit } = usePosAccess();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pos_sales_invoices")
      .select("*, pos_traders:trader_id(name)")
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false });
    setInvoices(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = invoices.filter((inv) => statusFilter === "all" || inv.status === statusFilter);
  const totals = filtered.reduce(
    (acc, inv) => {
      if (inv.status === "cancelled") return acc;
      acc.total += Number(inv.total) || 0;
      acc.due += Number(inv.due_amount) || 0;
      return acc;
    },
    { total: 0, due: 0 }
  );

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">Sales Invoices</h1>
        {canEdit && (
          <Link href="/pos/sales/new" className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm text-center">
            + New Sale
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", "confirmed", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border capitalize ${
              statusFilter === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs text-slate-500">Total Sales</p>
          <p className="text-lg font-semibold num">{fmt(totals.total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs text-slate-500">Due (Credit)</p>
          <p className="text-lg font-semibold num text-red-600">{fmt(totals.due)}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500">No invoices found.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-3">Invoice #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Date</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right num">Total</th>
                <th className="p-3 text-right num">Due</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id} className="border-t">
                  <td className="p-3 font-medium">
                    <Link href={`/pos/sales/${inv.id}`} className="text-blue-600 hover:underline">
                      {inv.invoice_no}
                    </Link>
                  </td>
                  <td className="p-3">{inv.pos_traders?.name || "—"}</td>
                  <td className="p-3">{inv.invoice_date}</td>
                  <td className="p-3 capitalize">{inv.sale_type}</td>
                  <td className="p-3 text-right num">{fmt(inv.total)}</td>
                  <td className={`p-3 text-right num ${inv.due_amount > 0 ? "text-red-600 font-medium" : ""}`}>
                    {fmt(inv.due_amount)}
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        inv.status === "cancelled"
                          ? "bg-slate-200 text-slate-500 line-through"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {inv.status === "cancelled" ? "Cancelled" : "Confirmed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
