"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

const AnnualReportAccessContext = createContext({ isAdmin: false, canEdit: false, canManage: false });
export function useAnnualReportAccess() {
  return useContext(AnnualReportAccessContext);
}

export default function AnnualReportLayout({ children }) {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, is_admin, status")
        .eq("id", session.user.id)
        .single();

      if (!profile || profile.status !== "approved") {
        router.replace("/login");
        return;
      }

      const admin = !!profile.is_admin;
      const owner = session.user.email === OWNER_EMAIL;
      let editAllowed = owner;
      let manageAllowed = owner;

      if (!owner) {
        const { data: grant } = await supabase
          .from("annual_report_access")
          .select("access_level")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (!grant) {
          router.replace(admin ? "/admin" : "/dashboard");
          return;
        }
        editAllowed = grant.access_level === "editor" || grant.access_level === "agency_owner";
        manageAllowed = grant.access_level === "agency_owner";
      }

      const { data: settings } = await supabase
        .from("app_settings")
        .select("logo_url")
        .eq("id", true)
        .maybeSingle();
      setLogoUrl(settings?.logo_url || null);

      setName(profile.full_name);
      setIsAdmin(admin);
      setCanEdit(editAllowed);
      setCanManage(manageAllowed);
      setChecked(true);
    }
    check();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Checking access...</p>
      </div>
    );
  }

  return (
    <AnnualReportAccessContext.Provider value={{ isAdmin, canEdit, canManage }}>
      <div className="min-h-screen bg-slate-50">
        <nav className="bg-gradient-to-r from-amber-600 to-orange-600 shadow-md px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-md object-cover bg-white" />
              ) : null}
              <span className="font-bold text-white truncate">Annual Report · {name}</span>
              {!canEdit && (
                <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full">
                  View only
                </span>
              )}
            </div>
            {canManage && (
              <Link href="/annual-report/access" className="text-sm text-amber-100 hover:text-white">
                Team Access
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="text-sm bg-white/20 text-white px-2.5 py-1 rounded-full font-medium hover:bg-white/30"
              >
                Admin Panel →
              </Link>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-amber-100 hover:text-white whitespace-nowrap"
          >
            Log out
          </button>
        </nav>
        <main className="p-3 sm:p-6">{children}</main>
      </div>
    </AnnualReportAccessContext.Provider>
  );
}
