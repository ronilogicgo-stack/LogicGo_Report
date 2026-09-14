"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import AnnualReportView from "@/components/AnnualReportView";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

export default function AdminAnnualReportPage() {
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setChecked(true);
        return;
      }

      if (session.user.email === OWNER_EMAIL) {
        setHasAccess(true);
        setCanEdit(true);
        setChecked(true);
        return;
      }

      const { data: grant } = await supabase
        .from("module_access")
        .select("access_level")
        .eq("user_id", session.user.id)
        .eq("module_key", "annual_report")
        .maybeSingle();

      setHasAccess(!!grant);
      setCanEdit(grant?.access_level === "editor" || grant?.access_level === "agency_owner");
      setChecked(true);
    }
    check();
  }, [supabase]);

  if (!checked) {
    return <p className="text-slate-500">Checking access...</p>;
  }

  if (!hasAccess) {
    return (
      <p className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-4 py-3 max-w-lg">
        You don't have access to the Annual Report. Ask the account owner
        ({OWNER_EMAIL}) to grant you access.
      </p>
    );
  }

  return <AnnualReportView canEdit={canEdit} />;
}
