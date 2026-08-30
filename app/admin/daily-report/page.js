"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { netSales, dailyCollectionGap, fmt, dateKey } from "@/lib/calculations";

export default function DailyReportPage() {
  const supabase = createClient();
  const [date, setDate] = useState(dateKey());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    // Every approved (or paused) sales person always appears here, even
    // with zero values if they haven't reported this particular day -
    // and any newly approved sales person shows up automatically the
    // next time this loads, with no manual setup needed.
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name, location")
      .eq("is_sales_person", true)
      .in("status", ["approved", "paused"])
      .order("full_name");

    if (!people || people.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const ids = people.map((p) => p.id);

    const { data: entries } = await supabase
      .from("daily_entries")
      .select("*")
      .in("user_id", ids)
      .eq("entry_date", date);

    const entryByUser = {};
    for (const e of entries || []) entryByUser[e.user_id] = e;

    const built = people.map((person, i) => {
      const e = entryByUser[person.id];
      const sales = Number(e?.sales) || 0;
      const collections = Number(e?.collections) || 0;
      const salesReturn = Number(e?.sales_return) || 0;
      return {
        sl: i + 1,
        person,
        sales,
        collections,
        gap: e ? Number(e.collection_gap) || 0 : dailyCollectionGap(sales, salesReturn, collections),
        salesReturn,
        netSales: e ? Number(e.net_sales) || 0 : netSales(sales, salesReturn),
        reported: !!e,
      };
    });

    setRows(built);
    setLoading(false);
  }, [date, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const grandTotal = rows.reduce(
    (acc, r) => {
      acc.sales += r.sales;
      acc.collections += r.collections;
      acc.gap += r.gap;
      acc.salesReturn += r.salesReturn;
      acc.netSales += r.netSales;
      return acc;
    },
    { sales: 0, collections: 0, gap: 0, salesReturn: 0, netSales: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">Daily Sales &amp; Collections Report</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded-lg px-3 py-2 w-full sm:w-auto"
        />
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">No approved sales persons yet.</p>
      ) : (
        <>
          {/* ---------- DESKTOP: table ---------- */}
          <div className="hidden md:block bg-white rounded-xl shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="p-3">SL</th>
                  <th className="p-3">Sales Person</th>
                  <th className="p-3">Location</th>
                  <th className="p-3 text-right">Sales Achievement</th>
                  <th className="p-3 text-right">Collections Achievement</th>
                  <th className="p-3 text-right">Gap</th>
                  <th className="p-3 text-right">Sales Return</th>
                  <th className="p-3 text-right">Net Sales</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.person.id} className={`border-t ${!r.reported ? "text-gray-400" : ""}`}>
                    <td className="p-3">{r.sl}</td>
                    <td className="p-3 font-medium">
                      <Link
                        href={`/admin/employee/${r.person.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {r.person.full_name}
                      </Link>
                    </td>
                    <td className="p-3">{r.person.location}</td>
                    <td className="p-3 text-right">{fmt(r.sales)}</td>
                    <td className="p-3 text-right">{fmt(r.collections)}</td>
                    <td className="p-3 text-right">{fmt(r.gap)}</td>
                    <td className="p-3 text-right">{fmt(r.salesReturn)}</td>
                    <td className="p-3 text-right font-medium">{fmt(r.netSales)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold border-t">
                <tr>
                  <td className="p-3" colSpan={3}>
                    Grand Total
                  </td>
                  <td className="p-3 text-right">{fmt(grandTotal.sales)}</td>
                  <td className="p-3 text-right">{fmt(grandTotal.collections)}</td>
                  <td className="p-3 text-right">{fmt(grandTotal.gap)}</td>
                  <td className="p-3 text-right">{fmt(grandTotal.salesReturn)}</td>
                  <td className="p-3 text-right">{fmt(grandTotal.netSales)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ---------- MOBILE: stacked cards ---------- */}
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div
                key={r.person.id}
                className={`bg-white rounded-xl shadow p-4 ${!r.reported ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Link
                    href={`/admin/employee/${r.person.id}`}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    {r.sl}. {r.person.full_name}
                  </Link>
                  <span className="text-xs text-gray-500">{r.person.location}</span>
                </div>
                <div className="grid grid-cols-2 gap-y-1 text-sm text-gray-600">
                  <span>Sales</span>
                  <span className="text-right">{fmt(r.sales)}</span>
                  <span>Collections</span>
                  <span className="text-right">{fmt(r.collections)}</span>
                  <span>Gap</span>
                  <span className="text-right">{fmt(r.gap)}</span>
                  <span>Sales Return</span>
                  <span className="text-right">{fmt(r.salesReturn)}</span>
                  <span className="font-medium text-gray-800">Net Sales</span>
                  <span className="text-right font-medium text-gray-800">
                    {fmt(r.netSales)}
                  </span>
                </div>
                {!r.reported && (
                  <p className="text-xs text-gray-400 mt-2 border-t pt-2">
                    No entry submitted for this date.
                  </p>
                )}
              </div>
            ))}

            <div className="bg-gray-900 text-white rounded-xl shadow p-4">
              <p className="font-semibold mb-2">Grand Total</p>
              <div className="grid grid-cols-2 gap-y-1 text-sm">
                <span className="text-gray-300">Sales</span>
                <span className="text-right">{fmt(grandTotal.sales)}</span>
                <span className="text-gray-300">Collections</span>
                <span className="text-right">{fmt(grandTotal.collections)}</span>
                <span className="text-gray-300">Gap</span>
                <span className="text-right">{fmt(grandTotal.gap)}</span>
                <span className="text-gray-300">Sales Return</span>
                <span className="text-right">{fmt(grandTotal.salesReturn)}</span>
                <span className="font-medium">Net Sales</span>
                <span className="text-right font-medium">{fmt(grandTotal.netSales)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
