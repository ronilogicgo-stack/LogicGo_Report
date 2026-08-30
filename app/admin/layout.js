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

      setAlsoSalesPerson(!!profile.is_sales_person);
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
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <span className="font-bold whitespace-nowrap">Sales Tracker · Admin</span>
          <Link href="/admin" className="text-sm text-gray-600 hover:text-black">
            Dashboard
          </Link>
          <Link
            href="/admin/daily-report"
            className="text-sm text-gray-600 hover:text-black"
          >
            Daily Report
          </Link>
          <Link
            href="/admin/requests"
            className="text-sm text-gray-600 hover:text-black"
          >
            Team &amp; Requests
          </Link>
          <Link
            href="/admin/analytics"
            className="text-sm text-gray-600 hover:text-black"
          >
            Analytics
          </Link>
          {alsoSalesPerson && (
            <Link
              href="/dashboard"
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              My Sales Dashboard →
            </Link>
          )}
        </div>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-black">
          Log out
        </button>
      </nav>
      <main className="p-3 sm:p-6">{children}</main>
    </div>
  );
}
