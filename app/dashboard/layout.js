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
  const [alsoAdmin, setAlsoAdmin] = useState(false);

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
        .select("is_admin, is_sales_person, status, full_name")
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

      setName(profile.full_name);
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
    <div className="min-h-screen">
      <nav className="bg-white border-b px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold truncate">Sales Tracker · {name}</span>
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-black">
            Dashboard
          </Link>
          <Link
            href="/dashboard/profile"
            className="text-sm text-gray-600 hover:text-black"
          >
            My Profile
          </Link>
          {alsoAdmin && (
            <Link
              href="/admin"
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Admin Panel →
            </Link>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-black whitespace-nowrap"
        >
          Log out
        </button>
      </nav>
      <main className="p-3 sm:p-6">{children}</main>
    </div>
  );
}
