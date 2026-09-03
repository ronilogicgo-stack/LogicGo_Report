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
  fmt,
  dateKey,
  monthStartFor,
  daysInMonthFor,
  dayOfMonthFor,
  CHART_COLORS,
} from "@/lib/calculations";
import { downloadCSV } from "@/lib/csv";
import { fetchAllRows } from "@/lib/fetchAll";
import ExportButtons from "@/components/ExportButtons";

export default function DailyReportPage() {
  const supabase = createClient();
  const [mode, setMode] = useState("single"); // "single" | "range"
  const [date, setDate] = useState(dateKey());
  const [rangeFrom, setRangeFrom] = useState(dateKey());
  const [rangeTo, setRangeTo] = useState(dateKey());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [forecast, setForecast] = useState({ perPerson: [], daysElapsed: 0, daysInMonth: 0 });

  // The effective date range this page is currently showing.
  const from = mode === "single" ? date : rangeFrom;
  const to = mode === "single" ? date : rangeTo;

  const load = useCallback(async () => {
    setLoading(true);

    // Every approved (or paused) sales person always appears here, even
    // with zero values if they haven't reported in this range - and any
    // newly approved sales person shows up automatically the next time
    // this loads, with no manual setup needed.
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

    // In "single day" mode, the month-to-date range (used for the
    // forecast) already fully contains the single selected day - so we
    // fetch it ONCE and derive both the day's table AND the forecast
    // from the same data, instead of querying the database twice for
    // overlapping date ranges.
    const monthStart = monthStartFor(date);
    const daysElapsed = dayOfMonthFor(date);
    const daysInMonth = daysInMonthFor(date);

    // Paginated fetch - a wide custom date range across many sales
    // persons (or a full month for a large team) can exceed Supabase's
    // default 1000-row-per-request cap, which would otherwise silently
    // under-report the totals.
    const entries =
      mode === "single"
        ? await fetchAllRows(() =>
            supabase
              .from("daily_entries")
              .select("*")
              .in("user_id", ids)
              .gte("entry_date", monthStart)
              .lte("entry_date", date)
          )
        : await fetchAllRows(() =>
            supabase
              .from("daily_entries")
              .select("*")
              .in("user_id", ids)
              .gte("entry_date", from)
              .lte("entry_date", to)
          );

    const relevantEntries =
      mode === "single" ? entries.filter((e) => e.entry_date === date) : entries;

    const entriesByUser = {};
    for (const e of relevantEntries) {
      if (!entriesByUser[e.user_id]) entriesByUser[e.user_id] = [];
      entriesByUser[e.user_id].push(e);
    }

    const built = people.map((person, i) => {
      const myEntries = entriesByUser[person.id] || [];
      const sales = myEntries.reduce((s, e) => s + (Number(e.sales) || 0), 0);
      const collections = myEntries.reduce((s, e) => s + (Number(e.collections) || 0), 0);
      const salesReturn = myEntries.reduce((s, e) => s + (Number(e.sales_return) || 0), 0);
      const otherTransaction = myEntries.reduce(
        (s, e) => s + (Number(e.other_transaction) || 0),
        0
      );
      const net = netSales(sales, salesReturn);
      return {
        sl: i + 1,
        person,
        sales,
        collections,
        gap: net - collections,
        salesReturn,
        otherTransaction,
        netSales: net,
        reported: myEntries.length > 0,
        daysReported: myEntries.length,
      };
    });

    setRows(built);

    // --- Monthly forecast (only meaningful for a single selected day):
    // how much would this month total if the month-to-date daily rate
    // (up to that day) continued for every remaining day of the month.
    if (mode === "single") {
      const soFarByUser = {};
      for (const e of entries || []) {
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
    } else {
      setForecast({ perPerson: [], daysElapsed: 0, daysInMonth: 0 });
    }

    setLoading(false);
  }, [mode, date, rangeFrom, rangeTo, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const grandTotal = rows.reduce(
    (acc, r) => {
      acc.sales += r.sales;
      acc.collections += r.collections;
      acc.gap += r.gap;
      acc.salesReturn += r.salesReturn;
      acc.otherTransaction += r.otherTransaction;
      acc.netSales += r.netSales;
      return acc;
    },
    { sales: 0, collections: 0, gap: 0, salesReturn: 0, otherTransaction: 0, netSales: 0 }
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

  function exportCSV() {
    const headers = [
      "SL",
      "Sales Person",
      "Location",
      ...(mode === "range" ? ["Days Reported"] : []),
      "Sales Achievement",
      "Collections Achievement",
      "Gap",
      "Sales Return",
      "Other Transaction",
      "Net Sales",
    ];
    const csvRows = rows.map((r) => [
      r.sl,
      r.person.full_name,
      r.person.location,
      ...(mode === "range" ? [r.daysReported] : []),
      r.sales,
      r.collections,
      r.gap,
      r.salesReturn,
      r.otherTransaction,
      r.netSales,
    ]);
    const filename =
      mode === "single"
        ? `daily_report_${date}.csv`
        : `sales_report_${from}_to_${to}.csv`;
    downloadCSV(filename, headers, csvRows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">Daily Sales &amp; Collections Report</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <div className="flex bg-white border rounded-lg p-1 flex-1 sm:flex-none">
            <button
              onClick={() => setMode("single")}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-sm font-medium ${
                mode === "single" ? "bg-black text-white" : "text-gray-600"
              }`}
            >
              Single Day
            </button>
            <button
              onClick={() => setMode("range")}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-sm font-medium ${
                mode === "range" ? "bg-black text-white" : "text-gray-600"
              }`}
            >
              Date Range
            </button>
          </div>
          <ExportButtons onDownloadCSV={exportCSV} />
        </div>
      </div>

      {mode === "single" ? (
        <div className="flex justify-end">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-lg px-3 py-2 w-full sm:w-auto"
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl shadow p-4">
          <label className="text-sm text-gray-500">
            From
            <input
              type="date"
              value={rangeFrom}
              max={rangeTo}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="ml-2 border rounded-lg px-2 py-1"
            />
          </label>
          <label className="text-sm text-gray-500">
            To
            <input
              type="date"
              value={rangeTo}
              min={rangeFrom}
              onChange={(e) => setRangeTo(e.target.value)}
              className="ml-2 border rounded-lg px-2 py-1"
            />
          </label>
        </div>
      )}

      <p className="text-sm text-gray-500">
        Showing <span className="font-medium">{from}</span>
        {from !== to && (
          <>
            {" "}
            to <span className="font-medium">{to}</span>
          </>
        )}
      </p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">No approved sales persons yet.</p>
      ) : (
        <div className="print-area">
          {/* ---------- DESKTOP: table ---------- */}
          <div className="hidden md:block bg-white rounded-xl shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="p-3">SL</th>
                  <th className="p-3">Sales Person</th>
                  <th className="p-3">Location</th>
                  {mode === "range" && <th className="p-3 text-right">Days Reported</th>}
                  <th className="p-3 text-right">Sales Achievement</th>
                  <th className="p-3 text-right">Collections Achievement</th>
                  <th className="p-3 text-right">Gap</th>
                  <th className="p-3 text-right">Sales Return</th>
                  <th className="p-3 text-right">Other Tran.</th>
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
                    {mode === "range" && (
                      <td className="p-3 text-right">{r.daysReported}</td>
                    )}
                    <td className="p-3 text-right">{fmt(r.sales)}</td>
                    <td className="p-3 text-right">{fmt(r.collections)}</td>
                    <td className="p-3 text-right">{fmt(r.gap)}</td>
                    <td className="p-3 text-right">{fmt(r.salesReturn)}</td>
                    <td className="p-3 text-right">{fmt(r.otherTransaction)}</td>
                    <td className="p-3 text-right font-medium">{fmt(r.netSales)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold border-t">
                <tr>
                  <td className="p-3" colSpan={mode === "range" ? 4 : 3}>
                    Grand Total
                  </td>
                  <td className="p-3 text-right">{fmt(grandTotal.sales)}</td>
                  <td className="p-3 text-right">{fmt(grandTotal.collections)}</td>
                  <td className="p-3 text-right">{fmt(grandTotal.gap)}</td>
                  <td className="p-3 text-right">{fmt(grandTotal.salesReturn)}</td>
                  <td className="p-3 text-right">{fmt(grandTotal.otherTransaction)}</td>
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
                  {mode === "range" && (
                    <>
                      <span>Days Reported</span>
                      <span className="text-right">{r.daysReported}</span>
                    </>
                  )}
                  <span>Sales</span>
                  <span className="text-right">{fmt(r.sales)}</span>
                  <span>Collections</span>
                  <span className="text-right">{fmt(r.collections)}</span>
                  <span>Gap</span>
                  <span className="text-right">{fmt(r.gap)}</span>
                  <span>Sales Return</span>
                  <span className="text-right">{fmt(r.salesReturn)}</span>
                  <span>Other Transaction</span>
                  <span className="text-right">{fmt(r.otherTransaction)}</span>
                  <span className="font-medium text-gray-800">Net Sales</span>
                  <span className="text-right font-medium text-gray-800">
                    {fmt(r.netSales)}
                  </span>
                </div>
                {!r.reported && (
                  <p className="text-xs text-gray-400 mt-2 border-t pt-2">
                    {mode === "single"
                      ? "No entry submitted for this date."
                      : "No entries submitted in this range."}
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
                <span className="text-gray-300">Other Tran.</span>
                <span className="text-right">{fmt(grandTotal.otherTransaction)}</span>
                <span className="font-medium">Net Sales</span>
                <span className="text-right font-medium">{fmt(grandTotal.netSales)}</span>
              </div>
            </div>
          </div>

          {/* ---------- CHART: Net Sales by Sales Person (this day) ---------- */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Net Sales by Sales Person - {from}
              {from !== to && ` to ${to}`}
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

          {/* ---------- MONTHLY FORECAST (single day mode only) ---------- */}
          {mode === "single" && (
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
          )}
        </div>
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
