"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function PaymentFollowupLayout({ children }) {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");
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
        .select("full_name, status")
        .eq("id", session.user.id)
        .single();

      if (!profile || profile.status !== "approved") {
        router.replace("/login");
        return;
      }

      const { data: settings } = await supabase
        .from("app_settings")
        .select("logo_url")
        .eq("id", true)
        .maybeSingle();
      setLogoUrl(settings?.logo_url || null);

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
      <nav className="bg-gradient-to-r from-indigo-600 to-purple-600 shadow-md px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-md object-cover bg-white" />
            ) : null}
            <span className="font-bold text-white truncate">
              Payment Follow-Up · {name}
            </span>
          </div>
          <Link href="/payment-followup" className="text-sm text-indigo-100 hover:text-white">
            My Branches
          </Link>
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
