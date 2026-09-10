"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function AdminLayout({ children }) {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [alsoSalesPerson, setAlsoSalesPerson] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const [missedCount, setMissedCount] = useState(0);

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
        .select("is_admin, is_sales_person")
        .eq("id", session.user.id)
        .single();

      if (!profile || !profile.is_admin) {
        router.replace("/login");
        return;
      }

      const { data: settings } = await supabase
        .from("app_settings")
        .select("logo_url")
        .eq("id", true)
        .maybeSingle();
      setLogoUrl(settings?.logo_url || null);

      setAlsoSalesPerson(!!profile.is_sales_person);
      setChecked(true);

      // Non-blocking: badge count for unresolved missed-entry notifications.
      const { count } = await supabase
        .from("admin_notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "missed_entry")
        .eq("resolved", false);
      setMissedCount(count || 0);
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
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="h-8 w-8 rounded-md object-cover bg-white"
              />
            ) : null}
            <span className="font-bold text-white whitespace-nowrap">
              Sales Tracker · Admin
            </span>
          </div>
          <Link href="/admin" className="text-sm text-indigo-100 hover:text-white">
            Dashboard
          </Link>
          <Link
            href="/admin/daily-report"
            className="text-sm text-indigo-100 hover:text-white"
          >
            Daily Report
          </Link>
          <Link
            href="/admin/notifications"
            className="text-sm text-indigo-100 hover:text-white inline-flex items-center gap-1.5"
          >
            Notifications
            {missedCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {missedCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/analytics"
            className="text-sm text-indigo-100 hover:text-white"
          >
            Analytics
          </Link>
          <Link
            href="/admin/payment-followup"
            className="text-sm text-indigo-100 hover:text-white"
          >
            Payment Follow-Up
          </Link>
          <Link
            href="/billing"
            className="text-sm text-indigo-100 hover:text-white"
          >
            Billing
          </Link>
          <Link
            href="/pos"
            className="text-sm text-indigo-100 hover:text-white"
          >
            POS
          </Link>
          <Link
            href="/admin/requests"
            className="text-sm text-indigo-100 hover:text-white"
          >
            Team &amp; Requests
          </Link>
          <Link
            href="/admin/settings"
            className="text-sm text-indigo-100 hover:text-white"
          >
            Settings
          </Link>
          {alsoSalesPerson && (
            <Link
              href="/dashboard"
              className="text-sm bg-white/20 text-white px-2.5 py-1 rounded-full font-medium hover:bg-white/30"
            >
              My Sales Dashboard →
            </Link>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-indigo-100 hover:text-white"
        >
          Log out
        </button>
      </nav>
      <main className="p-3 sm:p-6">{children}</main>
    </div>
  );
}
