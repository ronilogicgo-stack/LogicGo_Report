"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { ACTION_LABELS, formatDateTime } from "@/lib/rma";

export default function RmaAuditLogView({ basePath, isAdmin, canManage }) {
  const supabase = createClient();
  const [logs, setLogs] = useState([]);
  const [rmaMap, setRmaMap] = useState({});
  const [loading, setLoading] = useState(true);

  const [userFilter, setUserFilter] = useState("");
  const [rmaFilter, setRmaFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: log }, { data: rmas }] = await Promise.all([
      supabase.from("rma_audit_log").select("*").order("created_at", { ascending: false }),
      supabase.from("rma_records").select("id, rma_number, status"),
    ]);
    setLogs(log || []);
    setRmaMap(Object.fromEntries((rmas || []).map((r) => [r.id, r])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const userNames = useMemo(
    () => Array.from(new Set(logs.map((l) => l.user_name_snapshot).filter(Boolean))).sort(),
    [logs]
  );

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (userFilter && l.user_name_snapshot !== userFilter) return false;
      if (roleFilter && l.user_role_snapshot !== roleFilter) return false;
      if (actionFilter && l.action !== actionFilter) return false;
      if (rmaFilter) {
        const rmaNum = rmaMap[l.rma_id]?.rma_number || "";
        if (!rmaNum.toLowerCase().includes(rmaFilter.trim().toLowerCase())) return false;
      }
      if (fromDate && l.created_at < fromDate) return false;
      if (toDate && l.created_at > `${toDate}T23:59:59`) return false;
      return true;
    });
  }, [logs, userFilter, roleFilter, actionFilter, rmaFilter, fromDate, toDate, rmaMap]);

  if (!isAdmin && !canManage) {
    return (
      <p className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-4 py-3 max-w-lg">
        Only an Admin or Agency Owner of this module can view the full audit log.
      </p>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold">RMA Audit Log</h1>
        <Link href={basePath} className="text-sm text-blue-600 underline">
          ← All RMAs
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Complete, read-only history of every action across every RMA - nothing here can be edited or deleted.
      </p>

      <div className="flex flex-wrap gap-2 bg-white rounded-xl border border-slate-200 shadow-sm p-3">
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
          <option value="">All Users</option>
          {userNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
          <option value="">All Roles</option>
          <option value="Admin">Admin</option>
          <option value="Sales Person">Sales Person</option>
          <option value="Accounts">Accounts</option>
          <option value="User">User</option>
        </select>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
          <option value="">All Actions</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="RMA number..."
          value={rmaFilter}
          onChange={(e) => setRmaFilter(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm w-36"
        />
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
        {(userFilter || roleFilter || actionFilter || rmaFilter || fromDate || toDate) && (
          <button
            onClick={() => {
              setUserFilter("");
              setRoleFilter("");
              setActionFilter("");
              setRmaFilter("");
              setFromDate("");
              setToDate("");
            }}
            className="text-xs text-blue-600 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500">No matching activity.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Role</th>
                <th className="p-3">Action</th>
                <th className="p-3">RMA</th>
                <th className="p-3">Details</th>
                <th className="p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-3 font-medium">{l.user_name_snapshot}</td>
                  <td className="p-3 text-slate-500">{l.user_role_snapshot}</td>
                  <td className="p-3">{ACTION_LABELS[l.action] || l.action}</td>
                  <td className="p-3">
                    <Link href={`${basePath}/${l.rma_id}`} className="text-blue-600 hover:underline">
                      {rmaMap[l.rma_id]?.rma_number || "-"}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-500 max-w-xs truncate">
                    {l.previous_value && l.new_value ? `${l.previous_value} → ${l.new_value}` : l.new_value}
                    {l.remark && ` · "${l.remark}"`}
                  </td>
                  <td className="p-3 text-slate-500 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
