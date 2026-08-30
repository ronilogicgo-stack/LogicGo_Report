"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function TeamManagementPage() {
  const supabase = createClient();
  const [pending, setPending] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: pendingData } = await supabase
      .from("profiles")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setPending(pendingData || []);

    const { data: teamData } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "sales_person")
      .in("status", ["approved", "paused"])
      .order("full_name");

    if (teamData && teamData.length > 0) {
      const ids = teamData.map((p) => p.id);
      // One query for everyone's entries, newest first, so the FIRST row
      // per user_id we see is that person's most recent report date.
      const { data: entries } = await supabase
        .from("daily_entries")
        .select("user_id, entry_date")
        .in("user_id", ids)
        .order("entry_date", { ascending: false });

      const lastReport = {};
      for (const e of entries || []) {
        if (!lastReport[e.user_id]) lastReport[e.user_id] = e.entry_date;
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

  async function approve(id) {
    // Approving turns this pending request into a full sales_person,
    // with the same default behaviour as every other sales person.
    await supabase
      .from("profiles")
      .update({ role: "sales_person", status: "approved" })
      .eq("id", id);
    load();
  }

  async function reject(id) {
    await supabase.from("profiles").update({ status: "rejected" }).eq("id", id);
    load();
  }

  async function togglePause(person) {
    setBusyId(person.id);
    const nextStatus = person.status === "paused" ? "approved" : "paused";
    await supabase.from("profiles").update({ status: nextStatus }).eq("id", person.id);
    setBusyId(null);
    load();
  }

  function startEdit(person) {
    setEditingId(person.id);
    setEditForm({
      full_name: person.full_name || "",
      phone: person.phone || "",
      location: person.location || "",
      employee_code: person.employee_code || "",
    });
  }

  async function saveProfile(id) {
    await supabase
      .from("profiles")
      .update({
        full_name: editForm.full_name,
        phone: editForm.phone,
        location: editForm.location,
        employee_code: editForm.employee_code,
      })
      .eq("id", id);
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
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(p.id)}
                    className="bg-black text-white rounded-lg px-4 py-2 text-sm flex-1 sm:flex-none"
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

      {/* ---------- SALES TEAM (always visible) ---------- */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Sales Team</h2>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : team.length === 0 ? (
          <p className="text-gray-500">No approved sales persons yet.</p>
        ) : (
          <div className="space-y-3">
            {team.map((p) => (
              <div key={p.id} className="bg-white rounded-xl shadow p-4">
                {editingId === p.id ? (
                  <div className="space-y-2">
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
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{p.full_name}</p>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="text-sm text-gray-500">{p.email}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                        <span>📞 {p.phone || "-"}</span>
                        <span>📍 {p.location || "-"}</span>
                        <span>🆔 {p.employee_code || "-"}</span>
                        <span>
                          🗓 Last report:{" "}
                          <span className={p.last_report ? "" : "text-gray-400"}>
                            {p.last_report || "never"}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => startEdit(p)}
                        className="text-sm text-blue-600 underline"
                      >
                        Edit Profile
                      </button>
                      <button
                        disabled={busyId === p.id}
                        onClick={() => togglePause(p)}
                        className={`text-sm underline ${
                          p.status === "paused" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {p.status === "paused" ? "Resume Access" : "Pause Access"}
                      </button>
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
