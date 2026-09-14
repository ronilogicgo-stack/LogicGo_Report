"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { KNOWN_MODULES, moduleLabel, ACCESS_LEVELS } from "@/lib/modules";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

export default function AccessControlPage() {
  const supabase = createClient();
  const [isOwner, setIsOwner] = useState(false);
  const [manageableModules, setManageableModules] = useState(new Set());
  const [team, setTeam] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAccess, setSavingAccess] = useState(null);
  const [pendingModule, setPendingModule] = useState({});

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
    const key = `${userId}:${moduleKey}`;
    setSavingAccess(key);
    if (level === "none") {
      await supabase.from("module_access").delete().eq("user_id", userId).eq("module_key", moduleKey);
    } else {
      const { error } = await supabase
        .from("module_access")
        .upsert({ user_id: userId, module_key: moduleKey, access_level: level }, { onConflict: "user_id,module_key" });
      if (error) alert(`Could not save: ${error.message}`);
    }
    setSavingAccess(null);
    load();
  }

  const accessByUser = {};
  for (const row of accessRows) {
    (accessByUser[row.user_id] ||= []).push(row);
  }

  const manageableList = KNOWN_MODULES.filter((m) => manageableModules.has(m.key));

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg sm:text-xl font-bold">Module Access</h1>
        <p className="text-sm text-slate-500 mt-1">
          Pick a module and an access level to grant it - it'll appear as a tag below, and the
          ✕ removes it. Agency Owner is Editor-level access plus the ability to manage that same
          module's access for others{isOwner ? "" : " - only the account owner can grant it"}.
          You can only manage the module(s) you're an Agency Owner of
          {isOwner ? " (you're the account owner, so that's everything)" : ""}.
        </p>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : manageableList.length === 0 ? (
        <p className="text-slate-500">You aren't an Agency Owner of any module yet.</p>
      ) : (
        <div className="space-y-3">
          {team.map((person) => {
            const tags = (accessByUser[person.id] || []).filter((t) => manageableModules.has(t.module_key));
            const granted = new Set(tags.map((t) => t.module_key));
            const available = manageableList.filter((m) => !granted.has(m.key));
            const selectedModule = pendingModule[person.id] || available[0]?.key;

            return (
              <div key={person.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="font-medium">{person.full_name}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
                  {tags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-1 rounded-full"
                    >
                      {moduleLabel(t.module_key)}:{" "}
                      {t.access_level === "agency_owner" ? "Agency Owner" : t.access_level === "editor" ? "Editor" : "Viewer"}
                      <button
                        onClick={() => setLevel(person.id, t.module_key, "none")}
                        disabled={savingAccess === `${person.id}:${t.module_key}`}
                        className="text-red-500 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {available.length > 0 && (
                    <>
                      <select
                        value={selectedModule}
                        onChange={(e) => setPendingModule({ ...pendingModule, [person.id]: e.target.value })}
                        className="border rounded-full px-2 py-0.5"
                      >
                        {available.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value=""
                        disabled={savingAccess === `${person.id}:${selectedModule}`}
                        onChange={(e) => {
                          if (e.target.value) setLevel(person.id, selectedModule, e.target.value);
                        }}
                        className="border rounded-full px-2 py-0.5"
                      >
                        <option value="">Access...</option>
                        {ACCESS_LEVELS.filter((l) => l.value !== "none" && (l.value !== "agency_owner" || isOwner)).map(
                          (l) => (
                            <option key={l.value} value={l.value}>
                              {l.label}
                            </option>
                          )
                        )}
                      </select>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
