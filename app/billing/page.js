"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { fmt } from "@/lib/calculations";
import { STATUS_STYLES, statusLabel, isOverdue } from "@/lib/billing";
import { useBillingAccess } from "./layout";

const STATUS_FILTERS = ["all", "draft", "sent", "paid", "overdue", "cancelled"];

export default function BillingInvoicesPage() {
  const supabase = createClient();
  const { canEdit } = useBillingAccess();
  const searchParams = useSearchParams();
  const clientFilter = searchParams.get("client") || "";

  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("billing_invoices")
      .select("*, billing_clients:client_id(name)")
      .order("invoice_date", { ascending: false });
    if (clientFilter) query = query.eq("client_id", clientFilter);

    const [{ data: invoiceData }, { data: clientData }] = await Promise.all([
      query,
      supabase.from("billing_clients").select("id, name").order("name"),
    ]);
    setInvoices(invoiceData || []);
    setClients(clientData || []);
    setLoading(false);
  }, [supabase, clientFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = invoices.filter((inv) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "overdue") return isOverdue(inv);
    return inv.status === statusFilter;
  });

  const totals = filtered.reduce(
    (acc, inv) => {
      acc.total += Number(inv.total) || 0;
      acc.paid += Number(inv.paid_amount) || 0;
      acc.due += Number(inv.due_amount) || 0;
      return acc;
    },
    { total: 0, paid: 0, due: 0 }
  );

  const filterName = clientFilter
    ? clients.find((c) => c.id === clientFilter)?.name
    : null;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">
            Invoices {filterName && <span className="text-slate-400 font-normal">· {filterName}</span>}
          </h1>
          {filterName && (
            <Link href="/billing" className="text-xs text-blue-600 underline">
              Clear client filter
            </Link>
          )}
        </div>
        {canEdit && (
          <Link
            href={clientFilter ? `/billing/invoices/new?client=${clientFilter}` : "/billing/invoices/new"}
            className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm text-center"
          >
            + New Invoice
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
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

      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Total Billed" value={fmt(totals.total)} />
        <SummaryCard label="Received" value={fmt(totals.paid)} good />
        <SummaryCard label="Due" value={fmt(totals.due)} warn={totals.due > 0} />
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
                <th className="p-3">Client</th>
                <th className="p-3">Date</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right num">Total</th>
                <th className="p-3 text-right num">Due</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const overdue = isOverdue(inv);
                return (
                  <tr key={inv.id} className="border-t">
                    <td className="p-3 font-medium">
                      <Link href={`/billing/invoices/${inv.id}`} className="text-blue-600 hover:underline">
                        {inv.invoice_no}
                      </Link>
                    </td>
                    <td className="p-3">{inv.billing_clients?.name || "—"}</td>
                    <td className="p-3">{inv.invoice_date}</td>
                    <td className="p-3">
                      {inv.billing_type === "recurring" ? (
                        <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                          Recurring · {inv.recurring_interval}
                        </span>
                      ) : (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          One-time
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right num">{fmt(inv.total)}</td>
                    <td className={`p-3 text-right num ${inv.due_amount > 0 ? "text-red-600 font-medium" : ""}`}>
                      {fmt(inv.due_amount)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          overdue ? STATUS_STYLES.overdue : STATUS_STYLES[inv.status]
                        }`}
                      >
                        {overdue ? "Overdue" : statusLabel(inv.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, good, warn }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`text-lg font-semibold num ${
          good ? "text-green-600" : warn ? "text-red-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
