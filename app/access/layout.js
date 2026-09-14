"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

export default function AccessLayout({ children }) {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [name, setName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

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

      const owner = session.user.email === OWNER_EMAIL;
      let allowed = owner;

      if (!owner) {
        const { data: agencyRows } = await supabase
          .from("module_access")
          .select("module_key")
          .eq("user_id", session.user.id)
          .eq("access_level", "agency_owner");
        allowed = !!agencyRows && agencyRows.length > 0;
      }

      if (!allowed) {
        router.replace(profile.is_admin ? "/admin" : "/dashboard");
        return;
      }

      setIsOwner(owner);
      setIsAdmin(!!profile.is_admin);
      setName(profile.full_name);
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
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-gradient-to-r from-slate-700 to-slate-900 shadow-md px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold text-white truncate">Access Control · {name}</span>
          {isAdmin && (
            <Link
              href="/admin"
              className="text-sm bg-white/20 text-white px-2.5 py-1 rounded-full font-medium hover:bg-white/30"
            >
              Admin Panel →
            </Link>
          )}
        </div>
        <button onClick={handleLogout} className="text-sm text-slate-200 hover:text-white whitespace-nowrap">
          Log out
        </button>
      </nav>
      <main className="p-3 sm:p-6">{children}</main>
    </div>
  );
}
