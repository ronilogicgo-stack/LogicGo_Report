"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { KNOWN_MODULES, moduleLabel } from "@/lib/modules";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

export default function AccessControlPage() {
  const supabase = createClient();
  const [isOwner, setIsOwner] = useState(false);
  const [team, setTeam] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [agencyOwnerIds, setAgencyOwnerIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const [addingFor, setAddingFor] = useState(null);
  const [newModule, setNewModule] = useState(KNOWN_MODULES[0]?.key || "");
  const [newLevel, setNewLevel] = useState("viewer");

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setIsOwner(user?.email === OWNER_EMAIL);

    const [{ data: teamData }, { data: access }, { data: agency }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("status", ["approved", "paused"])
        .or("is_sales_person.eq.true,is_admin.eq.true")
        .order("full_name"),
      supabase.from("module_access").select("*"),
      supabase.from("agency_owners").select("user_id"),
    ]);

    setTeam(teamData || []);
    setAccessRows(access || []);
    setAgencyOwnerIds(new Set((agency || []).map((a) => a.user_id)));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTag(userId) {
    if (!newModule) return;
    setSaving(userId);
    const { error } = await supabase
      .from("module_access")
      .upsert({ user_id: userId, module_key: newModule, access_level: newLevel }, { onConflict: "user_id,module_key" });
    if (error) alert(`Could not save: ${error.message}`);
    setAddingFor(null);
    setSaving(null);
    load();
  }

  async function removeTag(rowId, userId) {
    setSaving(userId);
    await supabase.from("module_access").delete().eq("id", rowId);
    setSaving(null);
    load();
  }

  async function toggleAgencyOwner(userId, makeOwner) {
    setSaving(userId);
    if (makeOwner) {
      await supabase.from("agency_owners").insert({ user_id: userId });
    } else {
      await supabase.from("agency_owners").delete().eq("user_id", userId);
    }
    setSaving(null);
    load();
  }

  const accessByUser = {};
  for (const row of accessRows) {
    (accessByUser[row.user_id] ||= []).push(row);
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg sm:text-xl font-bold">Module Access</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tag a person with a module (e.g. "POS") to grant them access - Viewer is read-only,
          Editor can add/change data. An <span className="font-medium text-violet-700">Agency Owner</span> automatically
          gets full access to EVERY module and can manage this list themselves - only{" "}
          {isOwner ? "you" : "the account owner"} can make someone an Agency Owner.
        </p>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <div className="space-y-3">
          {team.map((person) => {
            const tags = accessByUser[person.id] || [];
            const isAgencyOwner = agencyOwnerIds.has(person.id);
            return (
              <div key={person.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-medium">{person.full_name}</p>
                  {isOwner && (
                    <label className="flex items-center gap-1.5 text-xs text-violet-700">
                      <input
                        type="checkbox"
                        checked={isAgencyOwner}
                        disabled={saving === person.id}
                        onChange={(e) => toggleAgencyOwner(person.id, e.target.checked)}
                      />
                      Agency Owner (all modules)
                    </label>
                  )}
                  {!isOwner && isAgencyOwner && (
                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                      Agency Owner
                    </span>
                  )}
                </div>

                {isAgencyOwner ? (
                  <p className="text-xs text-slate-400 mt-2">
                    Already has full access to every module as an Agency Owner - no individual tags needed.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {tags.length === 0 && addingFor !== person.id && (
                      <span className="text-xs text-slate-400">No module access yet</span>
                    )}
                    {tags.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-full"
                      >
                        {moduleLabel(t.module_key)}
                        <span className="text-slate-400">({t.access_level})</span>
                        <button
                          onClick={() => removeTag(t.id, person.id)}
                          disabled={saving === person.id}
                          className="text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </span>
                    ))}

                    {addingFor === person.id ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={newModule}
                          onChange={(e) => setNewModule(e.target.value)}
                          className="text-xs border rounded-full px-2 py-1"
                        >
                          {KNOWN_MODULES.filter((m) => !tags.some((t) => t.module_key === m.key)).map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={newLevel}
                          onChange={(e) => setNewLevel(e.target.value)}
                          className="text-xs border rounded-full px-2 py-1"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <button
                          onClick={() => addTag(person.id)}
                          disabled={saving === person.id}
                          className="text-xs bg-slate-900 text-white px-2.5 py-1 rounded-full"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setAddingFor(null)}
                          className="text-xs text-slate-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAddingFor(person.id);
                          const available = KNOWN_MODULES.find((m) => !tags.some((t) => t.module_key === m.key));
                          setNewModule(available?.key || "");
                          setNewLevel("viewer");
                        }}
                        className="text-xs text-blue-600 underline"
                      >
                        + Add module
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
