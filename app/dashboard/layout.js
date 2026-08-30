"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");

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
        .select("role, status, full_name")
        .eq("id", session.user.id)
        .single();

      if (!profile || profile.status !== "approved" || profile.role !== "sales_person") {
        router.replace("/login");
        return;
      }

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
        <p className="text-gray-500">Checking access...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <span className="font-bold">Sales Tracker · {name}</span>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-black">
          Log out
        </button>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
