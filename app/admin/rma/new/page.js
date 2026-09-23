"use client";

import { useAdminModuleAccess } from "@/lib/useAdminModuleAccess";
import RmaNewForm from "@/components/RmaNewForm";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

export default function AdminNewRmaPage() {
  const { checked, hasAccess, canEdit } = useAdminModuleAccess("rma");

  if (!checked) return <p className="text-slate-500">Checking access...</p>;
  if (!hasAccess || !canEdit) {
    return (
      <p className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-4 py-3 max-w-lg">
        You don't have permission to create an RMA. Ask the account owner ({OWNER_EMAIL}) for Editor access.
      </p>
    );
  }
  return <RmaNewForm basePath="/admin/rma" />;
}
