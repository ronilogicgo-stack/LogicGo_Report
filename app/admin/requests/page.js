"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function RequestsPage() {
  const supabase = createClient();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setPending(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id) {
    // Approving turns this pending request into a full sales_person,
    // with the same default targets/behaviour as every other sales person.
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Access Requests</h1>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : pending.length === 0 ? (
        <p className="text-gray-500">No pending requests.</p>
      ) : (
        <div className="bg-white rounded-xl shadow divide-y">
          {pending.map((p) => (
            <div key={p.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{p.full_name}</p>
                <p className="text-sm text-gray-500">{p.email}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => approve(p.id)}
                  className="bg-black text-white rounded-lg px-4 py-2 text-sm"
                >
                  Approve
                </button>
                <button
                  onClick={() => reject(p.id)}
                  className="border rounded-lg px-4 py-2 text-sm text-red-600"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
