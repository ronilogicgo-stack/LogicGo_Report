"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { createClient } from "@/lib/supabaseClient";
import { fmt, dateKey, CHART_COLORS } from "@/lib/calculations";
import { downloadCSV } from "@/lib/csv";
import { fetchAllRows } from "@/lib/fetchAll";
import ExportButtons from "@/components/ExportButtons";

const PRESETS = ["Daily", "Weekly", "Monthly", "Yearly", "Custom"];

function rangeForPreset(preset, customFrom, customTo) {
  const today = new Date();
  let from, to;

  if (preset === "Daily") {
    from = to = dateKey(today);
  } else if (preset === "Weekly") {
    const day = today.getDay(); // 0 = Sunday
    const start = new Date(today);
    start.setDate(today.getDate() - day);
    from = dateKey(start);
    to = dateKey(today);
  } else if (preset === "Monthly") {
    from = dateKey(new Date(today.getFullYear(), today.getMonth(), 1));
    to = dateKey(today);
  } else if (preset === "Yearly") {
    from = dateKey(new Date(today.getFullYear(), 0, 1));
    to = dateKey(today);
  } else {
    from = customFrom || dateKey(today);
    to = customTo || dateKey(today);
  }
  return { from, to };
}

export default function AnalyticsPage() {
  const supabase = createClient();
  const [preset, setPreset] = useState("Monthly");
  const [customFrom, setCustomFrom] = useState(dateKey());
  const [customTo, setCustomTo] = useState(dateKey());
  const [people, setPeople] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const { from, to } = rangeForPreset(preset, customFrom, customTo);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: peopleData } = await supabase
      .from("profiles")
      .select("id, full_name, location")
      .eq("is_sales_person", true)
      .eq("status", "approved");

    setPeople(peopleData || []);

    if (peopleData && peopleData.length > 0) {
      const ids = peopleData.map((p) => p.id);
      // Paginated fetch - a wide date range across many sales persons
      // can easily exceed Supabase's default 1000-row-per-request cap,
      // which would otherwise silently under-report the totals.
      const entryData = await fetchAllRows(() =>
        supabase
          .from("daily_entries")
          .select("user_id, entry_date, sales, collections, sales_return, net_sales")
          .in("user_id", ids)
          .gte("entry_date", from)
          .lte("entry_date", to)
      );
      setEntries(entryData);
    } else {
      setEntries([]);
    }

    setLoading(false);
  }, [supabase, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const peopleById = useMemo(() => {
    const m = {};
    for (const p of people) m[p.id] = p;
    return m;
  }, [people]);

  const byPerson = useMemo(() => {
    const totals = {};
    for (const e of entries) {
      totals[e.user_id] = (totals[e.user_id] || 0) + (Number(e.net_sales) || 0);
    }
    return Object.entries(totals)
      .map(([userId, net]) => ({
        userId,
        name: peopleById[userId]?.full_name || "Unknown",
        region: peopleById[userId]?.location || "",
        net,
      }))
      .sort((a, b) => b.net - a.net);
  }, [entries, peopleById]);

  const byRegion = useMemo(() => {
    const totals = {};
    for (const e of entries) {
      const region = peopleById[e.user_id]?.location || "Unknown";
      totals[region] = (totals[region] || 0) + (Number(e.net_sales) || 0);
    }
    return Object.entries(totals)
      .map(([region, net]) => ({ name: region, net }))
      .sort((a, b) => b.net - a.net);
  }, [entries, peopleById]);

  const trend = useMemo(() => {
    const totals = {};
    for (const e of entries) {
      totals[e.entry_date] = (totals[e.entry_date] || 0) + (Number(e.net_sales) || 0);
    }
    return Object.entries(totals)
      .map(([date, net]) => ({ date, net }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries]);

  const grandTotal = byPerson.reduce((s, p) => s + p.net, 0);
  const topPerson = byPerson[0];
  const topRegion = byRegion[0];

  function exportCSV() {
    const headers = ["Sales Person", "Region", "Net Sales"];
    const csvRows = byPerson.map((p) => [p.name, p.region, p.net]);
    downloadCSV(`analytics_${from}_to_${to}.csv`, headers, csvRows);
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">Sales Analytics</h1>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                preset === p ? "bg-black text-white" : "bg-white border text-gray-600"
              }`}
            >
              {p}
            </button>
          ))}
          <ExportButtons onDownloadCSV={exportCSV} />
        </div>
      </div>

      {preset === "Custom" && (
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl shadow p-4">
          <label className="text-sm text-gray-500">
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="ml-2 border rounded-lg px-2 py-1"
            />
          </label>
          <label className="text-sm text-gray-500">
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="ml-2 border rounded-lg px-2 py-1"
            />
          </label>
        </div>
      )}

      <p className="text-sm text-gray-500">
        Showing <span className="font-medium">{from}</span> to{" "}
        <span className="font-medium">{to}</span>
      </p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-gray-500">No entries in this date range yet.</p>
      ) : (
        <div className="print-area space-y-6">
          {/* Headline stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <HeadlineCard
              label="Total Net Sales"
              value={fmt(grandTotal)}
              color="bg-gradient-to-br from-indigo-500 to-indigo-700"
            />
            <HeadlineCard
              label="Top Performer"
              value={topPerson ? `${topPerson.name}` : "-"}
              sub={topPerson ? fmt(topPerson.net) : ""}
              color="bg-gradient-to-br from-emerald-500 to-emerald-700"
            />
            <HeadlineCard
              label="Top Region"
              value={topRegion ? `${topRegion.name}` : "-"}
              sub={topRegion ? fmt(topRegion.net) : ""}
              color="bg-gradient-to-br from-pink-500 to-rose-600"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Net Sales by Sales Person">
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(400, byPerson.length * 90) }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byPerson} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="#cbd5e1" />
                      <Tooltip formatter={(v) => fmt(v)} />
                      <Bar dataKey="net" radius={[6, 6, 6, 6]} maxBarSize={56}>
                        {byPerson.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {byPerson.length > 4 && (
                <p className="text-xs text-gray-400 mt-1">← scroll to see everyone →</p>
              )}
            </ChartCard>

            <ChartCard title="Net Sales by Region / Branch">
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(400, byRegion.length * 90) }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byRegion} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="#cbd5e1" />
                      <Tooltip formatter={(v) => fmt(v)} />
                      <Bar dataKey="net" radius={[6, 6, 6, 6]} maxBarSize={56}>
                        {byRegion.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {byRegion.length > 4 && (
                <p className="text-xs text-gray-400 mt-1">← scroll to see everyone →</p>
              )}
            </ChartCard>

            <ChartCard title="Daily Net Sales Trend" full>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="#6366f1"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}

function HeadlineCard({ label, value, sub, color }) {
  return (
    <div className={`rounded-xl shadow p-4 text-white ${color}`}>
      <p className="text-xs text-white/80">{label}</p>
      <p className="text-lg font-bold mt-1 truncate">{value}</p>
      {sub && <p className="text-sm text-white/90 mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children, full }) {
  return (
    <div className={`bg-white rounded-xl shadow p-4 ${full ? "lg:col-span-2" : ""}`}>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      {children}
    </div>
  );
}
