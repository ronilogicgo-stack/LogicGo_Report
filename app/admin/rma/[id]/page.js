"use client";

import { useAdminModuleAccess } from "@/lib/useAdminModuleAccess";
import RmaDetailView from "@/components/RmaDetailView";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

export default function AdminRmaDetailPage() {
  const { checked, hasAccess, canEdit } = useAdminModuleAccess("rma");

  if (!checked) return <p className="text-slate-500">Checking access...</p>;
  if (!hasAccess) {
    return (
      <p className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-4 py-3 max-w-lg">
        You don't have access to RMA. Ask the account owner ({OWNER_EMAIL}) to grant you access.
      </p>
    );
  }
  return <RmaDetailView basePath="/admin/rma" canEdit={canEdit} />;
}
