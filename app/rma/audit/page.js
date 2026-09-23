"use client";

import RmaAuditLogView from "@/components/RmaAuditLogView";
import { useRmaAccess } from "../layout";

export default function RmaAuditLogPage() {
  const { isAdmin, canManage } = useRmaAccess();
  return <RmaAuditLogView basePath="/rma" isAdmin={isAdmin} canManage={canManage} />;
}
