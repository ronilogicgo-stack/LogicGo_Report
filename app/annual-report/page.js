"use client";

import AnnualReportView from "@/components/AnnualReportView";
import { useAnnualReportAccess } from "./layout";

export default function AnnualReportPage() {
  const { canEdit } = useAnnualReportAccess();
  return <AnnualReportView canEdit={canEdit} />;
}
