"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import PaymentFollowupBranch from "@/components/PaymentFollowupBranch";

export default function MyBranchDetailPage() {
  const { branchId } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [grant, setGrant] = useState(null);
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const [{ data: grantData }, { data: branchData }] = await Promise.all([
        supabase
          .from("payment_followup_access")
          .select("*")
          .eq("user_id", session.user.id)
          .eq("branch_id", branchId)
          .maybeSingle(),
        supabase.from("payment_followup_branches").select("*").eq("id", branchId).single(),
      ]);

      setGrant(grantData);
      setBranch(branchData);
      setLoading(false);
    }
    load();
  }, [branchId]);

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (!branch) return <p className="text-slate-500">Branch not found.</p>;
  if (!grant) {
    return (
      <p className="text-slate-500">
        You don't have access to this branch. Ask your Admin to grant it.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.push("/payment-followup")}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to My Branches
      </button>
      <PaymentFollowupBranch
        branchId={branch.id}
        branchName={branch.name}
        canEdit={grant.access_level === "editor"}
      />
    </div>
  );
}
