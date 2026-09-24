"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

/** For a module page nested inside /admin/* (e.g. /admin/rma), check
 * access the same way the standalone module's own layout does (Owner,
 * or an explicit module_access grant) - an ordinary Admin does NOT get
 * automatic access, matching the same rule already applied to
 * POS/Annual Report. */
export function useAdminModuleAccess(moduleKey) {
  const supabase = createClient();
  const [state, setState] = useState({
    checked: false,
    hasAccess: false,
    canEdit: false,
    canManage: false,
    canDelete: false,
    isAdmin: false,
  });

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setState((s) => ({ ...s, checked: true }));
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, is_sales_person, is_accounts")
        .eq("id", session.user.id)
        .single();
      const isAdmin = !!profile?.is_admin;
      const deleteAllowed = isAdmin || !!profile?.is_sales_person || !!profile?.is_accounts;

      if (session.user.email === OWNER_EMAIL) {
        if (!cancelled) {
          setState({ checked: true, hasAccess: true, canEdit: true, canManage: true, canDelete: true, isAdmin });
        }
        return;
      }

      const { data: grant } = await supabase
        .from("module_access")
        .select("access_level")
        .eq("user_id", session.user.id)
        .eq("module_key", moduleKey)
        .maybeSingle();

      if (!cancelled) {
        setState({
          checked: true,
          hasAccess: !!grant,
          canEdit: grant?.access_level === "editor" || grant?.access_level === "agency_owner",
          canManage: grant?.access_level === "agency_owner",
          canDelete: deleteAllowed,
          isAdmin,
        });
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [supabase, moduleKey]);

  return state;
}
