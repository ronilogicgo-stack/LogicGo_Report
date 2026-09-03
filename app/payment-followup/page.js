"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function MyPaymentFollowupBranchesPage() {
  const supabase = createClient();
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("payment_followup_access")
      .select("*, payment_followup_branches:branch_id(id, name)")
      .eq("user_id", session.user.id);
    setGrants(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg sm:text-xl font-bold">My Branches</h1>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : grants.length === 0 ? (
        <p className="text-slate-500">
          You don't have access to any branch's Payment Follow-Up yet. Ask
          your Admin to grant you access.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {grants.map((g) => (
            <Link
              key={g.id}
              href={`/payment-followup/${g.payment_followup_branches.id}`}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:border-slate-400 transition"
            >
              <p className="font-semibold">{g.payment_followup_branches.name}</p>
              <span
                className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                  g.access_level === "editor"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {g.access_level === "editor" ? "Editor access" : "Viewer access"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
