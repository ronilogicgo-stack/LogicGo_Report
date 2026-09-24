"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Menu, X, Bell, LayoutDashboard, FileText, BarChart3, Wallet,
  ShoppingBag, FileBarChart, Wrench, Users, Settings, LogOut, ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { usePushNotifications } from "@/lib/usePushNotifications";

const OWNER_EMAIL = "roni.logicgo@gmail.com";

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [alsoSalesPerson, setAlsoSalesPerson] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const [missedCount, setMissedCount] = useState(0);
  const [canSeePos, setCanSeePos] = useState(false);
  const [canSeeAnnualReport, setCanSeeAnnualReport] = useState(false);
  const [canSeeRma, setCanSeeRma] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userId, setUserId] = useState(null);
  usePushNotifications(userId);

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
      setUserId(session.user.id);
      setChecked(true);

      const isOwner = session.user.email === OWNER_EMAIL;
      if (isOwner) {
        setCanSeePos(true);
        setCanSeeAnnualReport(true);
        setCanSeeRma(true);
      } else {
        const [{ data: posGrant }, { data: reportGrant }, { data: rmaGrant }] = await Promise.all([
          supabase
            .from("module_access")
            .select("id")
            .eq("user_id", session.user.id)
            .eq("module_key", "pos")
            .maybeSingle(),
          supabase
            .from("module_access")
            .select("id")
            .eq("user_id", session.user.id)
            .eq("module_key", "annual_report")
            .maybeSingle(),
          supabase
            .from("module_access")
            .select("id")
            .eq("user_id", session.user.id)
            .eq("module_key", "rma")
            .maybeSingle(),
        ]);
        setCanSeePos(!!posGrant);
        setCanSeeAnnualReport(!!reportGrant);
        setCanSeeRma(!!rmaGrant);
      }

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
      {/* ---------- Desktop nav (unchanged) ---------- */}
      <nav className="hidden md:flex bg-gradient-to-r from-indigo-600 to-purple-600 shadow-md px-4 sm:px-6 py-3 sm:py-4 flex-wrap items-center justify-between gap-3">
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
          {canSeePos && (
            <Link
              href="/pos"
              className="text-sm text-indigo-100 hover:text-white"
            >
              POS
            </Link>
          )}
          {canSeeAnnualReport && (
            <Link
              href="/admin/annual-report"
              className="text-sm text-indigo-100 hover:text-white"
            >
              Annual Report
            </Link>
          )}
          {canSeeRma && (
            <Link
              href="/admin/rma"
              className="text-sm text-indigo-100 hover:text-white"
            >
              RMA
            </Link>
          )}
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

      {/* ---------- Mobile header ---------- */}
      <header className="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded-md object-cover" />
          ) : null}
          <span className="font-bold text-slate-800">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/notifications" className="relative" onClick={() => setMenuOpen(false)}>
            <Bell size={22} className={missedCount > 0 ? "text-amber-500" : "text-slate-400"} />
            {missedCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {missedCount}
              </span>
            )}
          </Link>
          <button onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={24} className="text-slate-700" />
          </button>
        </div>
      </header>

      {/* ---------- Mobile drawer menu ---------- */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute right-0 top-0 bottom-0 w-72 max-w-[85%] bg-white shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
              <span className="font-bold text-slate-800">Menu</span>
              <button onClick={() => setMenuOpen(false)}>
                <X size={22} className="text-slate-400" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              <DrawerLink href="/admin" icon={LayoutDashboard} label="Dashboard" active={pathname === "/admin"} onNavigate={() => setMenuOpen(false)} />
              <DrawerLink href="/admin/daily-report" icon={FileText} label="Daily Report" active={pathname === "/admin/daily-report"} onNavigate={() => setMenuOpen(false)} />
              <DrawerLink
                href="/admin/notifications"
                icon={Bell}
                label="Notifications"
                badge={missedCount}
                active={pathname === "/admin/notifications"}
                onNavigate={() => setMenuOpen(false)}
              />
              <DrawerLink href="/admin/analytics" icon={BarChart3} label="Analytics" active={pathname === "/admin/analytics"} onNavigate={() => setMenuOpen(false)} />
              <DrawerLink href="/admin/payment-followup" icon={Wallet} label="Payment Follow-Up" active={pathname?.startsWith("/admin/payment-followup")} onNavigate={() => setMenuOpen(false)} />
              {canSeePos && (
                <DrawerLink href="/pos" icon={ShoppingBag} label="POS" active={pathname?.startsWith("/pos")} onNavigate={() => setMenuOpen(false)} />
              )}
              {canSeeAnnualReport && (
                <DrawerLink href="/admin/annual-report" icon={FileBarChart} label="Annual Report" active={pathname === "/admin/annual-report"} onNavigate={() => setMenuOpen(false)} />
              )}
              {canSeeRma && (
                <DrawerLink href="/admin/rma" icon={Wrench} label="RMA" active={pathname?.startsWith("/admin/rma")} onNavigate={() => setMenuOpen(false)} />
              )}
              <DrawerLink href="/admin/requests" icon={Users} label="Team & Requests" active={pathname === "/admin/requests"} onNavigate={() => setMenuOpen(false)} />
              <DrawerLink href="/admin/settings" icon={Settings} label="Settings" active={pathname === "/admin/settings"} onNavigate={() => setMenuOpen(false)} />
              {alsoSalesPerson && (
                <Link
                  href="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  className="mx-3 my-2 flex items-center justify-center gap-1.5 bg-indigo-50 text-indigo-600 rounded-lg px-3 py-2 text-sm font-medium"
                >
                  My Sales Dashboard <ArrowRight size={14} />
                </Link>
              )}
            </nav>
            <div className="border-t border-slate-100 p-3">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-red-600 text-sm font-medium"
              >
                <LogOut size={18} /> Log out
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="p-3 sm:p-6">{children}</main>
    </div>
  );
}

function DrawerLink({ href, icon: Icon, label, active, badge, onNavigate }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center justify-between gap-2 px-4 py-3 text-sm ${
        active ? "bg-indigo-50 text-indigo-600 font-medium" : "text-slate-700"
      }`}
    >
      <span className="flex items-center gap-3">
        <Icon size={18} />
        {label}
      </span>
      {badge > 0 && (
        <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold">
          {badge}
        </span>
      )}
    </Link>
  );
}
