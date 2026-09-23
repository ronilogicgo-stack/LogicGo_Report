"use client";

import RmaListView from "@/components/RmaListView";
import { useRmaAccess } from "./layout";

export default function RmaListPage() {
  const { canEdit } = useRmaAccess();
  return <RmaListView basePath="/rma" canEdit={canEdit} />;
}
