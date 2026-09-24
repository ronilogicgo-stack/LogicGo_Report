"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { RMA_STATUSES, STATUS_COLORS, formatDateTime } from "@/lib/rma";

export default function RmaListView({ basePath, canEdit }) {
  const supabase = createClient();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("rma_records")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setRecords(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("rma_list_sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "rma_records" }, () => load())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [supabase, load]);

  const filtered = records.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.trim().toLowerCase();
      const haystack = [r.rma_number, r.customer_name, r.customer_phone, r.product_name, r.serial_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">RMAs</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RMA #, customer, phone, product, serial…"
            className="border rounded-lg px-3 py-2 text-sm w-full sm:w-72"
          />
          {canEdit && (
            <Link href={`${basePath}/new`} className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm whitespace-nowrap">
              + New RMA
            </Link>
          )}
          <Link href={`${basePath}/audit`} className="text-sm text-blue-600 underline whitespace-nowrap">
            Audit Log
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`text-xs px-3 py-1.5 rounded-full border ${
            statusFilter === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600"
          }`}
        >
          All
        </button>
        {RMA_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              statusFilter === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500">No RMAs found.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-3">RMA #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Product</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created By</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-medium">
                    <Link href={`${basePath}/${r.id}`} className="text-blue-600 hover:underline">
                      {r.rma_number}
                    </Link>
                  </td>
                  <td className="p-3">
                    {r.customer_name}
                    <div className="text-xs text-slate-400">{r.customer_phone}</div>
                  </td>
                  <td className="p-3">
                    {r.product_name}
                    {r.product_model && <div className="text-xs text-slate-400">{r.product_model}</div>}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500">{r.created_by_name}</td>
                  <td className="p-3 text-slate-500 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
