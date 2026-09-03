"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAll";

export default function TeamManagementPage() {
  const supabase = createClient();
  const [myId, setMyId] = useState(null);
  const [pending, setPending] = useState([]);
  const [team, setTeam] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [busyId, setBusyId] = useState(null);

  // Which roles are checked for each still-pending request, before approving.
  const [pendingRoles, setPendingRoles] = useState({});

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) setMyId(session.user.id);

    const { data: pendingData } = await supabase
      .from("profiles")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setPending(pendingData || []);

    // Default every new pending request to "Sales Person" checked.
    setPendingRoles((prev) => {
      const next = { ...prev };
      for (const p of pendingData || []) {
        if (!(p.id in next)) next[p.id] = { is_sales_person: true, is_admin: false };
      }
      return next;
    });

    const { data: teamData } = await supabase
      .from("profiles")
      .select("*")
      .in("status", ["approved", "paused"])
      .or("is_sales_person.eq.true,is_admin.eq.true")
      .order("full_name");

    if (teamData && teamData.length > 0) {
      const salesIds = teamData.filter((p) => p.is_sales_person).map((p) => p.id);
      let lastReport = {};
      if (salesIds.length > 0) {
        // Uses the last_report_per_user database view, which computes
        // this aggregate in Postgres (fast, indexed) instead of
        // downloading every daily entry ever made and scanning for the
        // max in the browser - this stays fast no matter how much data
        // has piled up over time.
        const { data: reports } = await supabase
          .from("last_report_per_user")
          .select("user_id, last_report")
          .in("user_id", salesIds);
        for (const r of reports || []) {
          lastReport[r.user_id] = r.last_report;
        }
      }
      setTeam(teamData.map((p) => ({ ...p, last_report: lastReport[p.id] || null })));
    } else {
      setTeam([]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(person) {
    const roles = pendingRoles[person.id] || { is_sales_person: true, is_admin: false };
    setBusyId(person.id);
    const { error } = await supabase
      .from("profiles")
      .update({
        is_sales_person: roles.is_sales_person,
        is_admin: roles.is_admin,
        status: "approved",
      })
      .eq("id", person.id);
    setBusyId(null);
    if (error) alert(`Could not approve: ${error.message}`);
    load();
  }

  async function reject(id) {
    const { error } = await supabase
      .from("profiles")
      .update({ status: "rejected" })
      .eq("id", id);
    if (error) alert(`Could not reject: ${error.message}`);
    load();
  }

  async function togglePause(person) {
    setBusyId(person.id);
    const nextStatus = person.status === "paused" ? "approved" : "paused";
    const { error } = await supabase
      .from("profiles")
      .update({ status: nextStatus })
      .eq("id", person.id);
    setBusyId(null);
    if (error) alert(`Could not update status: ${error.message}`);
    load();
  }

  async function approveEmailChange(person) {
    setBusyId(person.id);
    const { error } = await supabase
      .from("profiles")
      .update({
        email: person.requested_email,
        email_change_pending: false,
        requested_email: null,
      })
      .eq("id", person.id);
    setBusyId(null);
    if (error) alert(`Could not approve email change: ${error.message}`);
    load();
  }

  async function rejectEmailChange(person) {
    setBusyId(person.id);
    const { error } = await supabase
      .from("profiles")
      .update({ email_change_pending: false, requested_email: null })
      .eq("id", person.id);
    setBusyId(null);
    if (error) alert(`Could not reject email change: ${error.message}`);
    load();
  }

  async function downloadData(person) {
    // Paginated fetch - years of history for one person can exceed
    // Supabase's default 1000-row-per-request cap, which would
    // otherwise silently truncate the exported file.
    const entries = await fetchAllRows(() =>
      supabase
        .from("daily_entries")
        .select(
          "entry_date, sales, collections, sales_return, other_transaction, net_sales, collection_gap, remarks"
        )
        .eq("user_id", person.id)
        .order("entry_date", { ascending: true })
    );

    const header =
      "Date,Sales,Collections,Sales Return,Other Transaction,Net Sales,Collection Gap,Remarks\n";
    const rows = entries
      .map(
        (e) =>
          `${e.entry_date},${e.sales},${e.collections},${e.sales_return},${e.other_transaction},${e.net_sales},${e.collection_gap},"${(
            e.remarks || ""
          ).replace(/"/g, '""')}"`
      )
      .join("\n");
    const csv = header + rows;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${person.full_name.replace(/\s+/g, "_")}_data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount(person) {
    const typed = prompt(
      `This will PERMANENTLY delete ${person.full_name}'s account and ALL their data (entries, targets, profile). This cannot be undone.\n\nMake sure you've downloaded their data first if you need it.\n\nType their name exactly to confirm: "${person.full_name}"`
    );
    if (typed !== person.full_name) {
      if (typed !== null) alert("Name did not match. Deletion cancelled.");
      return;
    }

    setBusyId(person.id);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch("/api/admin/delete-employee", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId: person.id }),
    });
    const result = await res.json();
    setBusyId(null);

    if (!res.ok) {
      alert(`Could not delete: ${result.error}`);
      return;
    }
    load();
  }

  const filteredTeam = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return team;
    return team.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
    );
  }, [team, searchQuery]);

  function startEdit(person) {
    setEditingId(person.id);
    setEditForm({
      full_name: person.full_name || "",
      phone: person.phone || "",
      location: person.location || "",
      employee_code: person.employee_code || "",
      is_sales_person: person.is_sales_person,
      is_admin: person.is_admin,
    });
  }

  async function saveProfile(id) {
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editForm.full_name,
        phone: editForm.phone,
        location: editForm.location,
        employee_code: editForm.employee_code,
        is_sales_person: editForm.is_sales_person,
        is_admin: editForm.is_admin,
      })
      .eq("id", id);
    if (error) {
      alert(`Could not save: ${error.message}`);
      return;
    }
    setEditingId(null);
    load();
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* ---------- PENDING REQUESTS ---------- */}
      <div className="space-y-3">
        <h1 className="text-lg sm:text-xl font-bold">Access Requests</h1>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : pending.length === 0 ? (
          <p className="text-gray-500">No pending requests.</p>
        ) : (
          <div className="bg-white rounded-xl shadow divide-y">
            {pending.map((p) => (
              <div
                key={p.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <p className="font-medium">{p.full_name}</p>
                  <p className="text-sm text-gray-500">{p.email}</p>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={pendingRoles[p.id]?.is_sales_person ?? true}
                        onChange={(e) =>
                          setPendingRoles({
                            ...pendingRoles,
                            [p.id]: {
                              ...pendingRoles[p.id],
                              is_sales_person: e.target.checked,
                            },
                          })
                        }
                      />
                      Sales Person
                    </label>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={pendingRoles[p.id]?.is_admin ?? false}
                        onChange={(e) =>
                          setPendingRoles({
                            ...pendingRoles,
                            [p.id]: {
                              ...pendingRoles[p.id],
                              is_admin: e.target.checked,
                            },
                          })
                        }
                      />
                      Admin
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busyId === p.id}
                    onClick={() => approve(p)}
                    className="bg-black text-white rounded-lg px-4 py-2 text-sm flex-1 sm:flex-none disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => reject(p.id)}
                    className="border rounded-lg px-4 py-2 text-sm text-red-600 flex-1 sm:flex-none"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- TEAM (always visible - Sales Persons and/or Admins) ---------- */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-bold">Team</h2>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-full sm:w-64"
          />
        </div>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : team.length === 0 ? (
          <p className="text-gray-500">No approved team members yet.</p>
        ) : filteredTeam.length === 0 ? (
          <p className="text-gray-500">No team members match "{searchQuery}".</p>
        ) : (
          <div className="space-y-3">
            {filteredTeam.map((p) => (
              <div key={p.id} className="bg-white rounded-xl shadow p-4 space-y-3">
                {p.email_change_pending && (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span>
                      Requested email change to{" "}
                      <strong>{p.requested_email}</strong> - account is locked
                      until you decide.
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={busyId === p.id}
                        onClick={() => approveEmailChange(p)}
                        className="bg-black text-white rounded px-3 py-1.5 text-xs"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busyId === p.id}
                        onClick={() => rejectEmailChange(p)}
                        className="border rounded px-3 py-1.5 text-xs text-red-600"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}
                {editingId === p.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <LabeledInput
                        label="Full Name"
                        value={editForm.full_name}
                        onChange={(v) => setEditForm({ ...editForm, full_name: v })}
                      />
                      <LabeledInput
                        label="Phone Number"
                        value={editForm.phone}
                        onChange={(v) => setEditForm({ ...editForm, phone: v })}
                      />
                      <LabeledInput
                        label="Branch / Region"
                        value={editForm.location}
                        onChange={(v) => setEditForm({ ...editForm, location: v })}
                      />
                      <LabeledInput
                        label="Employee / Branch ID"
                        value={editForm.employee_code}
                        onChange={(v) =>
                          setEditForm({ ...editForm, employee_code: v })
                        }
                      />
                    </div>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={editForm.is_sales_person}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              is_sales_person: e.target.checked,
                            })
                          }
                        />
                        Sales Person
                      </label>
                      <label
                        className={`flex items-center gap-1.5 text-sm ${
                          p.id === myId ? "text-gray-400" : ""
                        }`}
                        title={
                          p.id === myId
                            ? "You cannot remove your own Admin access."
                            : ""
                        }
                      >
                        <input
                          type="checkbox"
                          disabled={p.id === myId}
                          checked={editForm.is_admin}
                          onChange={(e) =>
                            setEditForm({ ...editForm, is_admin: e.target.checked })
                          }
                        />
                        Admin
                      </label>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => saveProfile(p.id)}
                        className="bg-black text-white rounded px-4 py-2 text-sm flex-1"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="border rounded px-4 py-2 text-sm flex-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold shrink-0">
                          {p.full_name?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{p.full_name}</p>
                          <StatusBadge status={p.status} />
                          {p.is_sales_person && <RoleBadge label="Sales Person" />}
                          {p.is_admin && <RoleBadge label="Admin" color="indigo" />}
                        </div>
                        <p className="text-sm text-gray-500">{p.email}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                          <span>📞 {p.phone || "-"}</span>
                          <span>📍 {p.location || "-"}</span>
                          <span>🆔 {p.employee_code || "-"}</span>
                          {p.is_sales_person && (
                            <span>
                              🗓 Last report:{" "}
                              <span className={p.last_report ? "" : "text-gray-400"}>
                                {p.last_report || "never"}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <button
                        onClick={() => startEdit(p)}
                        className="text-sm text-blue-600 underline"
                      >
                        Edit Profile
                      </button>
                      {p.is_sales_person && (
                        <button
                          disabled={busyId === p.id}
                          onClick={() => togglePause(p)}
                          className={`text-sm underline ${
                            p.status === "paused" ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {p.status === "paused" ? "Resume Access" : "Pause Access"}
                        </button>
                      )}
                      <button
                        onClick={() => downloadData(p)}
                        className="text-sm text-gray-600 underline"
                      >
                        Download Data
                      </button>
                      {p.id !== myId && (
                        <button
                          disabled={busyId === p.id}
                          onClick={() => deleteAccount(p)}
                          className="text-sm text-red-700 underline font-medium"
                        >
                          Delete Account
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    approved: "bg-green-100 text-green-700",
    paused: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        styles[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {status === "paused" ? "Paused" : "Active"}
    </span>
  );
}

function RoleBadge({ label, color = "gray" }) {
  const styles = {
    gray: "bg-gray-100 text-gray-600",
    indigo: "bg-indigo-100 text-indigo-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[color]}`}>
      {label}
    </span>
  );
}

function LabeledInput({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="text"
        className="w-full border rounded px-3 py-2 mt-0.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
