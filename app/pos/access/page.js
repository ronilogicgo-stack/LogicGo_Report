"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

export default function PosAccessPage() {
  const supabase = createClient();
  const [team, setTeam] = useState([]);
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [selectedUser, setSelectedUser] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: teamData }, { data: grantData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("status", ["approved", "paused"])
        .or("is_sales_person.eq.true,is_admin.eq.true")
        .order("full_name"),
      supabase.from("pos_access").select("*, profiles:user_id(full_name, email)"),
    ]);
    setTeam(teamData || []);
    setGrants(grantData || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const owner = user?.email === OWNER_EMAIL;
      setIsOwner(owner);

      if (owner) {
        setCanManage(true);
      } else {
        const { data: myGrant } = await supabase
          .from("pos_access")
          .select("access_level")
          .eq("user_id", user?.id)
          .maybeSingle();
        setCanManage(myGrant?.access_level === "agency_owner");
      }
      setCheckingAccess(false);
    }
    checkAccess();
    load();
  }, [load]);

  async function addGrant(e) {
    e.preventDefault();
    setError("");
    if (!selectedUser) return;
    setSaving(true);
    const { error: grantError } = await supabase
      .from("pos_access")
      .upsert({ user_id: selectedUser, access_level: selectedLevel }, { onConflict: "user_id" });
    if (grantError) {
      setError(grantError.message);
    } else {
      setSelectedUser("");
      load();
    }
    setSaving(false);
  }

  async function removeGrant(id) {
    if (!confirm("Remove this person's access to the POS module?")) return;
    await supabase.from("pos_access").delete().eq("id", id);
    load();
  }

  const grantedIds = new Set(grants.map((g) => g.user_id));
  const availableTeam = team.filter((t) => !grantedIds.has(t.id));

  const levelLabel = (level) =>
    level === "agency_owner" ? "Agency Owner" : level === "editor" ? "Editor" : "Viewer";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-lg sm:text-xl font-bold">POS · Team Access</h1>
      <p className="text-sm text-slate-500">
        Grant a team member Viewer (read-only), Editor (can add/edit
        products, traders &amp; invoices), or Agency Owner (Editor, plus can
        manage this list themselves) access to the POS module. This is
        separate from Billing and from Sales Person / Admin roles.
      </p>

      {!checkingAccess && !canManage && (
        <p className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-4 py-3">
          You don't have permission to grant or remove POS access. Only the
          account owner ({OWNER_EMAIL}) or someone made an Agency Owner of
          POS can do that. You can view the current list below.
        </p>
      )}

      {canManage && (
        <form
          onSubmit={addGrant}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
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
              {availableTeam.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
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
              {isOwner && <option value="agency_owner">Agency Owner</option>}
            </select>
          </div>
          <button
            disabled={saving}
            className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Grant Access"}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : grants.length === 0 ? (
        <p className="text-slate-500">No access granted yet - only the Owner can see POS.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y">
          {grants.map((g) => (
            <div key={g.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{g.profiles?.full_name}</p>
                <p className="text-xs text-slate-500">
                  <span
                    className={
                      g.access_level === "agency_owner"
                        ? "text-violet-600 font-medium"
                        : g.access_level === "editor"
                        ? "text-emerald-600"
                        : "text-slate-500"
                    }
                  >
                    {levelLabel(g.access_level)}
                  </span>
                </p>
              </div>
              {canManage && (g.access_level !== "agency_owner" || isOwner) && (
                <button onClick={() => removeGrant(g.id)} className="text-xs text-red-600 underline">
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
