"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { KNOWN_MODULES, ACCESS_LEVELS } from "@/lib/modules";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

export default function AccessControlPage() {
  const supabase = createClient();
  const [isOwner, setIsOwner] = useState(false);
  const [manageableModules, setManageableModules] = useState(new Set());
  const [team, setTeam] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const owner = user?.email === OWNER_EMAIL;
    setIsOwner(owner);

    const [{ data: teamData }, { data: access }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("status", ["approved", "paused"])
        .or("is_sales_person.eq.true,is_admin.eq.true")
        .order("full_name"),
      supabase.from("module_access").select("*"),
    ]);

    setTeam(teamData || []);
    setAccessRows(access || []);

    if (owner) {
      setManageableModules(new Set(KNOWN_MODULES.map((m) => m.key)));
    } else {
      const mine = (access || []).filter((r) => r.user_id === user?.id && r.access_level === "agency_owner");
      setManageableModules(new Set(mine.map((r) => r.module_key)));
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function setLevel(userId, moduleKey, level) {
    setSaving(`${userId}:${moduleKey}`);
    if (level === "none") {
      await supabase.from("module_access").delete().eq("user_id", userId).eq("module_key", moduleKey);
    } else {
      const { error } = await supabase
        .from("module_access")
        .upsert({ user_id: userId, module_key: moduleKey, access_level: level }, { onConflict: "user_id,module_key" });
      if (error) alert(`Could not save: ${error.message}`);
    }
    setSaving(null);
    load();
  }

  const accessByUser = {};
  for (const row of accessRows) {
    (accessByUser[row.user_id] ||= {})[row.module_key] = row.access_level;
  }

  const visibleModules = KNOWN_MODULES.filter((m) => manageableModules.has(m.key));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-lg sm:text-xl font-bold">Module Access</h1>
        <p className="text-sm text-slate-500 mt-1">
          For each module: Viewer (read-only), Editor (can add/change data), or Agency Owner
          (Editor, plus can manage who else has access to that same module - only the account
          owner can grant Agency Owner). You can only manage the module(s) you're an Agency Owner
          of{isOwner ? " (you're the account owner, so that's everything)" : ""}.
        </p>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : visibleModules.length === 0 ? (
        <p className="text-slate-500">You aren't an Agency Owner of any module yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-3">Team Member</th>
                {visibleModules.map((m) => (
                  <th key={m.key} className="p-3">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((person) => (
                <tr key={person.id} className="border-t">
                  <td className="p-3 font-medium">{person.full_name}</td>
                  {visibleModules.map((m) => {
                    const current = accessByUser[person.id]?.[m.key] || "none";
                    const key = `${person.id}:${m.key}`;
                    return (
                      <td key={m.key} className="p-2">
                        <select
                          value={current}
                          disabled={saving === key}
                          onChange={(e) => setLevel(person.id, m.key, e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm"
                        >
                          {ACCESS_LEVELS.filter((l) => l.value !== "agency_owner" || isOwner).map((l) => (
                            <option key={l.value} value={l.value}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
