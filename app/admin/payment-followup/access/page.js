"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function PaymentFollowupAccessPage() {
  const supabase = createClient();
  const [branches, setBranches] = useState([]);
  const [team, setTeam] = useState([]);
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedUser, setSelectedUser] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: branchData }, { data: teamData }, { data: grantData }] = await Promise.all([
      supabase.from("payment_followup_branches").select("*").order("name"),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("status", ["approved", "paused"])
        .or("is_sales_person.eq.true,is_admin.eq.true")
        .order("full_name"),
      supabase
        .from("payment_followup_access")
        .select("*, profiles:user_id(full_name, email), payment_followup_branches:branch_id(name)"),
    ]);
    setBranches(branchData || []);
    setTeam(teamData || []);
    setGrants(grantData || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function addGrant(e) {
    e.preventDefault();
    setError("");
    if (!selectedUser || !selectedBranch) return;
    setSaving(true);
    const { error: grantError } = await supabase.from("payment_followup_access").upsert(
      { user_id: selectedUser, branch_id: selectedBranch, access_level: selectedLevel },
      { onConflict: "user_id,branch_id" }
    );
    if (grantError) {
      setError(grantError.message);
    } else {
      setSelectedUser("");
      setSelectedBranch("");
      load();
    }
    setSaving(false);
  }

  async function removeGrant(id) {
    if (!confirm("Remove this person's access to this branch?")) return;
    await supabase.from("payment_followup_access").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-lg sm:text-xl font-bold">Payment Follow-Up · Team Access</h1>
      <p className="text-sm text-slate-500">
        Grant a team member Editor (can add/edit records) or Viewer (read-only)
        access to a specific branch's Payment Follow-Up data. This is
        separate from their Sales Person / Admin role.
      </p>

      <form
        onSubmit={addGrant}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <div>
          <label className="text-xs text-slate-500">Team Member</label>
          <select
            required
            className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">Select...</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Branch</label>
          <select
            required
            className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
          >
            <option value="">Select...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Access Level</label>
          <select
            className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
        </div>
        <button
          disabled={saving}
          className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
        >
          {saving ? "Saving..." : "Grant Access"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : grants.length === 0 ? (
        <p className="text-slate-500">No access granted yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y">
          {grants.map((g) => (
            <div key={g.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{g.profiles?.full_name}</p>
                <p className="text-xs text-slate-500">
                  {g.payment_followup_branches?.name} ·{" "}
                  <span className={g.access_level === "editor" ? "text-emerald-600" : "text-slate-500"}>
                    {g.access_level === "editor" ? "Editor" : "Viewer"}
                  </span>
                </p>
              </div>
              <button
                onClick={() => removeGrant(g.id)}
                className="text-xs text-red-600 underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
