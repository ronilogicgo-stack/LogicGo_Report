"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import PaymentFollowupBranch from "@/components/PaymentFollowupBranch";

export default function AdminBranchDetailPage() {
  const { branchId } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("payment_followup_branches")
      .select("*")
      .eq("id", branchId)
      .single()
      .then(({ data }) => {
        setBranch(data);
        setLoading(false);
      });
  }, [branchId]);

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (!branch) return <p className="text-slate-500">Branch not found.</p>;

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.push("/admin/payment-followup")}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to Branches
      </button>
      {/* Admin always has full edit rights over every branch */}
      <PaymentFollowupBranch branchId={branch.id} branchName={branch.name} canEdit={true} />
    </div>
  );
}
