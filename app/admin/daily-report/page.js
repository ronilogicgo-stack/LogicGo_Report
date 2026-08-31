"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";
import { createClient } from "@/lib/supabaseClient";
import {
  netSales,
  dailyCollectionGap,
  fmt,
  dateKey,
  monthStartFor,
  daysInMonthFor,
  dayOfMonthFor,
  CHART_COLORS,
} from "@/lib/calculations";

export default function DailyReportPage() {
  const supabase = createClient();
  const [date, setDate] = useState(dateKey());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [forecast, setForecast] = useState({ perPerson: [], daysElapsed: 0, daysInMonth: 0 });

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
      setForecast({ perPerson: [], daysElapsed: 0, daysInMonth: 0 });
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

    // --- Monthly forecast: how much would this month total if the
    // month-to-date daily rate (up to the selected date) continued for
    // every remaining day of the month. ---
    const monthStart = monthStartFor(date);
    const daysElapsed = dayOfMonthFor(date);
    const daysInMonth = daysInMonthFor(date);

    const { data: monthEntries } = await supabase
      .from("daily_entries")
      .select("user_id, net_sales")
      .in("user_id", ids)
      .gte("entry_date", monthStart)
      .lte("entry_date", date);

    const soFarByUser = {};
    for (const e of monthEntries || []) {
      soFarByUser[e.user_id] = (soFarByUser[e.user_id] || 0) + (Number(e.net_sales) || 0);
    }

    const perPerson = people.map((person) => {
      const soFar = soFarByUser[person.id] || 0;
      const dailyAvg = daysElapsed > 0 ? soFar / daysElapsed : 0;
      const projectedTotal = dailyAvg * daysInMonth;
      const projectedRemaining = Math.max(0, projectedTotal - soFar);
      return { name: person.full_name, soFar, projectedTotal, projectedRemaining };
    });

    setForecast({ perPerson, daysElapsed, daysInMonth });
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

  const forecastTotals = useMemo(() => {
    return forecast.perPerson.reduce(
      (acc, p) => {
        acc.soFar += p.soFar;
        acc.projectedTotal += p.projectedTotal;
        return acc;
      },
      { soFar: 0, projectedTotal: 0 }
    );
  }, [forecast]);

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

          {/* ---------- CHART: Net Sales by Sales Person (this day) ---------- */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Net Sales by Sales Person - {date}
            </h3>
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(400, rows.length * 90) }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={rows.map((r) => ({ name: r.person.full_name, net: r.netSales }))}
                    margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={55} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReferenceLine y={0} stroke="#cbd5e1" />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Bar dataKey="net" radius={[6, 6, 6, 6]} maxBarSize={56}>
                      {rows.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {rows.length > 4 && (
              <p className="text-xs text-gray-400 mt-1">← scroll to see everyone →</p>
            )}
          </div>

          {/* ---------- MONTHLY FORECAST ---------- */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold">
              Monthly Forecast{" "}
              <span className="text-sm font-normal text-gray-400">
                (if this rate continues all month)
              </span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ForecastCard
                label="Net Sales So Far This Month"
                value={fmt(forecastTotals.soFar)}
                color="bg-gradient-to-br from-slate-600 to-slate-800"
              />
              <ForecastCard
                label="Projected Month Total"
                value={fmt(forecastTotals.projectedTotal)}
                color="bg-gradient-to-br from-indigo-500 to-indigo-700"
              />
              <ForecastCard
                label="Days Elapsed"
                value={`${forecast.daysElapsed} / ${forecast.daysInMonth} days`}
                color="bg-gradient-to-br from-emerald-500 to-emerald-700"
              />
            </div>

            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Achieved So Far vs Projected Remaining (per Sales Person)
              </h3>
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(400, forecast.perPerson.length * 100) }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={forecast.perPerson}
                      margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={55} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => fmt(v)} />
                      <Legend />
                      <Bar
                        dataKey="soFar"
                        name="Achieved So Far"
                        stackId="a"
                        fill="#6366f1"
                        radius={[0, 0, 0, 0]}
                        maxBarSize={56}
                      />
                      <Bar
                        dataKey="projectedRemaining"
                        name="Projected Remaining"
                        stackId="a"
                        fill="#c7d2fe"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={56}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Light shade = projected extra sales if the current daily average
                continues for the rest of the month.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ForecastCard({ label, value, color }) {
  return (
    <div className={`rounded-xl shadow p-4 text-white ${color}`}>
      <p className="text-xs text-white/80">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}
