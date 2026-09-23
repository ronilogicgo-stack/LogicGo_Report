"use client";

import RmaDetailView from "@/components/RmaDetailView";
import { useRmaAccess } from "../layout";

export default function RmaDetailPage() {
  const { canEdit } = useRmaAccess();
  return <RmaDetailView basePath="/rma" canEdit={canEdit} />;
}
