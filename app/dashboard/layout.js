"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [alsoAdmin, setAlsoAdmin] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);

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
        .select("is_admin, is_sales_person, status, full_name, avatar_url")
        .eq("id", session.user.id)
        .single();

      if (!profile || profile.status !== "approved" || !profile.is_sales_person) {
        // Covers paused/rejected/pending accounts too - sign out any
        // stale session so a pause takes effect immediately, even if
        // the tab was already open. (An Admin-only account with no
        // Sales Person role also lands here, since this dashboard isn't
        // meant for them.)
        await supabase.auth.signOut();
        router.replace(profile?.status === "paused" ? "/login?paused=1" : "/login");
        return;
      }

      const { data: settings } = await supabase
        .from("app_settings")
        .select("logo_url")
        .eq("id", true)
        .maybeSingle();
      setLogoUrl(settings?.logo_url || null);

      setName(profile.full_name);
      setAvatarUrl(profile.avatar_url || null);
      setAlsoAdmin(!!profile.is_admin);
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
        <p className="text-gray-500">Checking access...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-gradient-to-r from-indigo-600 to-purple-600 shadow-md px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="h-8 w-8 rounded-md object-cover bg-white"
              />
            ) : null}
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full object-cover border-2 border-white/50"
              />
            ) : null}
            <span className="font-bold text-white truncate">Sales Tracker · {name}</span>
          </div>
          <Link href="/dashboard" className="text-sm text-indigo-100 hover:text-white">
            Dashboard
          </Link>
          <Link
            href="/dashboard/profile"
            className="text-sm text-indigo-100 hover:text-white"
          >
            My Profile
          </Link>
          {alsoAdmin && (
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
          className="text-sm text-indigo-100 hover:text-white whitespace-nowrap"
        >
          Log out
        </button>
      </nav>
      <main className="p-3 sm:p-6">{children}</main>
    </div>
  );
}
