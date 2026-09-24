"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Home, User, Wallet, ShoppingBag, MoreHorizontal, Bell, X, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [alsoAdmin, setAlsoAdmin] = useState(false);
  const [hasFollowupAccess, setHasFollowupAccess] = useState(false);
  const [hasPosAccess, setHasPosAccess] = useState(false);
  const [hasAnnualReportAccess, setHasAnnualReportAccess] = useState(false);
  const [hasRmaAccess, setHasRmaAccess] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

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

      const { data: grants } = await supabase
        .from("payment_followup_access")
        .select("id")
        .eq("user_id", session.user.id)
        .limit(1);
      setHasFollowupAccess(!!grants && grants.length > 0);

      const { data: posGrant } = await supabase
        .from("module_access")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("module_key", "pos")
        .maybeSingle();
      setHasPosAccess(!!posGrant);

      const { data: reportGrant } = await supabase
        .from("module_access")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("module_key", "annual_report")
        .maybeSingle();
      setHasAnnualReportAccess(!!reportGrant);

      const { data: rmaGrant } = await supabase
        .from("module_access")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("module_key", "rma")
        .maybeSingle();
      setHasRmaAccess(!!rmaGrant);

      const { count: requestedCount } = await supabase
        .from("daily_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id)
        .eq("entry_type", "requested");
      setPendingCount(requestedCount || 0);

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

  const isActive = (href) => pathname === href;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ---------- Desktop nav (unchanged) ---------- */}
      <nav className="hidden md:flex bg-gradient-to-r from-indigo-600 to-purple-600 shadow-md px-4 sm:px-6 py-3 sm:py-4 flex-wrap items-center justify-between gap-3">
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
          {hasFollowupAccess && (
            <Link
              href="/payment-followup"
              className="text-sm text-indigo-100 hover:text-white"
            >
              Payment Follow-Up
            </Link>
          )}
          {hasPosAccess && (
            <Link href="/pos" className="text-sm text-indigo-100 hover:text-white">
              POS
            </Link>
          )}
          {hasAnnualReportAccess && (
            <Link href="/annual-report" className="text-sm text-indigo-100 hover:text-white">
              Annual Report
            </Link>
          )}
          {hasRmaAccess && (
            <Link href="/rma" className="text-sm text-indigo-100 hover:text-white">
              RMA
            </Link>
          )}
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

      {/* ---------- Mobile header ---------- */}
      <header className="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded-md object-cover" />
          ) : null}
          <span className="font-bold text-slate-800 text-lg">Sales Tracker</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell size={22} className={pendingCount > 0 ? "text-amber-500" : "text-slate-400"} />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </div>
          <Link href="/dashboard/profile">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover border border-slate-200" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <User size={18} />
              </div>
            )}
          </Link>
        </div>
      </header>

      <main className="p-3 sm:p-6 pb-24 md:pb-6">{children}</main>

      {/* ---------- Mobile bottom navigation ---------- */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex items-stretch pb-[env(safe-area-inset-bottom,0px)]">
        <BottomTab href="/dashboard" label="Home" icon={Home} active={isActive("/dashboard")} />
        {hasFollowupAccess && (
          <BottomTab href="/payment-followup" label="Payments" icon={Wallet} active={pathname?.startsWith("/payment-followup")} />
        )}
        {hasPosAccess && (
          <BottomTab href="/pos" label="POS" icon={ShoppingBag} active={pathname?.startsWith("/pos")} />
        )}
        <BottomTab href="/dashboard/profile" label="Profile" icon={User} active={isActive("/dashboard/profile")} />
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-slate-500"
        >
          <MoreHorizontal size={22} />
          <span className="text-[11px]">More</span>
        </button>
      </nav>

      {/* ---------- "More" bottom sheet ---------- */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full bg-white rounded-t-2xl p-4 pb-8 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-700">More</span>
              <button onClick={() => setMoreOpen(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            {hasAnnualReportAccess && (
              <Link href="/annual-report" className="block px-2 py-3 text-slate-700 border-b border-slate-100">
                Annual Report
              </Link>
            )}
            {hasRmaAccess && (
              <Link href="/rma" className="block px-2 py-3 text-slate-700 border-b border-slate-100">
                RMA
              </Link>
            )}
            {alsoAdmin && (
              <Link href="/admin" className="block px-2 py-3 text-indigo-600 font-medium border-b border-slate-100">
                Admin Panel →
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-2 py-3 text-red-600 text-left"
            >
              <LogOut size={18} /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BottomTab({ href, label, icon: Icon, active }) {
  return (
    <Link
      href={href}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 ${
        active ? "text-indigo-600" : "text-slate-500"
      }`}
    >
      <Icon size={22} strokeWidth={active ? 2.5 : 2} />
      <span className="text-[11px]">{label}</span>
    </Link>
  );
}
