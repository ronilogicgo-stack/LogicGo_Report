"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { fmt, dateKey } from "@/lib/calculations";

const LOW_STOCK_THRESHOLD = 10;

export default function PosDashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [productCount, setProductCount] = useState(0);
  const [lowStock, setLowStock] = useState([]);
  const [todaysSales, setTodaysSales] = useState(0);
  const [todaysInvoiceCount, setTodaysInvoiceCount] = useState(0);
  const [recentInvoices, setRecentInvoices] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const today = dateKey();

    const [{ count: pCount }, { data: low }, { data: todays }, { data: recent }] = await Promise.all([
      supabase.from("pos_products").select("id", { count: "exact", head: true }),
      supabase
        .from("pos_products")
        .select("id, name, current_stock")
        .lte("current_stock", LOW_STOCK_THRESHOLD)
        .order("current_stock"),
      supabase
        .from("pos_sales_invoices")
        .select("total")
        .eq("invoice_date", today)
        .eq("status", "confirmed"),
      supabase
        .from("pos_sales_invoices")
        .select("*, pos_traders:trader_id(name)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    setProductCount(pCount || 0);
    setLowStock(low || []);
    setTodaysSales((todays || []).reduce((sum, i) => sum + Number(i.total || 0), 0));
    setTodaysInvoiceCount((todays || []).length);
    setRecentInvoices(recent || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h1 className="text-lg sm:text-xl font-bold">POS Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Products" value={productCount} />
        <StatCard label="Today's Sales" value={fmt(todaysSales)} good />
        <StatCard label="Today's Invoices" value={todaysInvoiceCount} />
        <StatCard label="Low Stock Items" value={lowStock.length} warn={lowStock.length > 0} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">Recent Invoices</h2>
            <Link href="/pos/sales" className="text-xs text-blue-600 underline">
              View all
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No invoices yet.</p>
          ) : (
            <div className="divide-y">
              {recentInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/pos/sales/${inv.id}`}
                  className="p-3 flex items-center justify-between text-sm hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-blue-600">{inv.invoice_no}</p>
                    <p className="text-xs text-slate-500">{inv.pos_traders?.name}</p>
                  </div>
                  <span className="num">{fmt(inv.total)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">Low Stock ({`≤${LOW_STOCK_THRESHOLD}`})</h2>
            <Link href="/pos/products" className="text-xs text-blue-600 underline">
              View all
            </Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Nothing running low. 🎉</p>
          ) : (
            <div className="divide-y">
              {lowStock.slice(0, 5).map((p) => (
                <div key={p.id} className="p-3 flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="text-red-600 font-medium num">{p.current_stock}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, good, warn }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold num ${good ? "text-green-600" : warn ? "text-red-600" : ""}`}>
        {value}
      </p>
    </div>
  );
}
