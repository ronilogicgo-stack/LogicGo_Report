"use client";

import { useAdminModuleAccess } from "@/lib/useAdminModuleAccess";
import RmaAuditLogView from "@/components/RmaAuditLogView";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

export default function AdminRmaAuditPage() {
  const { checked, hasAccess, isAdmin, canManage } = useAdminModuleAccess("rma");

  if (!checked) return <p className="text-slate-500">Checking access...</p>;
  if (!hasAccess) {
    return (
      <p className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-4 py-3 max-w-lg">
        You don't have access to RMA. Ask the account owner ({OWNER_EMAIL}) to grant you access.
      </p>
    );
  }
  return <RmaAuditLogView basePath="/admin/rma" isAdmin={isAdmin} canManage={canManage} />;
}
