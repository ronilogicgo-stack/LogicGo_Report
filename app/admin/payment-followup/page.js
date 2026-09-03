"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { sortFollowups, followupPriority } from "@/lib/calculations";

export default function PaymentFollowupBranchesPage() {
  const supabase = createClient();
  const [branches, setBranches] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [newBranchName, setNewBranchName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: branchData } = await supabase
      .from("payment_followup_branches")
      .select("*")
      .order("name");
    setBranches(branchData || []);

    if (branchData && branchData.length > 0) {
      const { data: records } = await supabase
        .from("payment_followups")
        .select("branch_id, payment_status, followup_date_1, followup_date_2, followup_date_3, followup_date_4, followup_date_5");

      const byBranch = {};
      for (const b of branchData) byBranch[b.id] = { red: 0, yellow: 0, normal: 0, total: 0 };
      for (const r of records || []) {
        if (!byBranch[r.branch_id]) continue;
        byBranch[r.branch_id][followupPriority(r)]++;
        byBranch[r.branch_id].total++;
      }
      setCounts(byBranch);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function addBranch(e) {
    e.preventDefault();
    setError("");
    setAdding(true);
    const { error: addError } = await supabase
      .from("payment_followup_branches")
      .insert({ name: newBranchName.trim() });
    if (addError) {
      setError(addError.message);
    } else {
      setNewBranchName("");
      load();
    }
    setAdding(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">Payment Follow-Up</h1>
        <Link
          href="/admin/payment-followup/access"
          className="text-sm text-blue-600 underline"
        >
          Manage Team Access →
        </Link>
      </div>

      <form onSubmit={addBranch} className="flex flex-wrap gap-2">
        <input
          type="text"
          required
          placeholder="New branch name (e.g. Chittagong)"
          value={newBranchName}
          onChange={(e) => setNewBranchName(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <button
          disabled={adding}
          className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
        >
          + Add Branch
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : branches.length === 0 ? (
        <p className="text-slate-500">No branches yet - add one above.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((b) => {
            const c = counts[b.id] || { red: 0, yellow: 0, normal: 0, total: 0 };
            return (
              <Link
                key={b.id}
                href={`/admin/payment-followup/${b.id}`}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:border-slate-400 transition"
              >
                <p className="font-semibold">{b.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{c.total} records</p>
                <div className="flex gap-2 mt-3 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                    {c.red} overdue
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                    {c.yellow} tomorrow
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
