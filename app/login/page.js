"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    params.get("paused") === "1"
      ? "Your account has been paused by the admin. Please contact your admin."
      : ""
  );
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("logo_url")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setLogoUrl(data?.logo_url || null));

    // Supabase's password-reset email link sometimes lands the browser
    // here (on /login) instead of directly on /reset-password, because
    // of how it verifies the token before redirecting. Listening for
    // Supabase's own PASSWORD_RECOVERY event - which fires the moment
    // it detects a valid recovery link, no matter which page it landed
    // on - is the officially recommended way to catch this reliably and
    // send the person to the right place automatically.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.push("/reset-password");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, is_sales_person, status")
      .eq("id", data.user.id)
      .single();

    if (!profile) {
      setError("Profile not found. Contact admin.");
      setLoading(false);
      return;
    }

    if (profile.is_admin) {
      // Admin access does not depend on `status` - pausing only affects
      // a person's Sales Person capabilities, never their Admin rights.
      router.push("/admin");
    } else if (profile.is_sales_person && profile.status === "approved") {
      router.push("/dashboard");
    } else if (profile.is_sales_person && profile.status === "paused") {
      await supabase.auth.signOut();
      setError("Your account has been paused by the admin. Please contact your admin.");
    } else if (profile.status === "pending") {
      await supabase.auth.signOut();
      setError("Your request is still pending admin approval.");
    } else {
      await supabase.auth.signOut();
      setError("Your access request was rejected. Contact admin.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-4"
      >
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-14 w-14 mx-auto rounded-xl object-cover" />
        ) : null}
        <h1 className="text-2xl font-bold text-center">Sales Tracker</h1>
        <p className="text-sm text-gray-500 text-center">Sign in to your account</p>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>
        )}

        <div>
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full border rounded-lg px-3 py-2 text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="text-right mt-1">
            <Link href="/forgot-password" className="text-xs text-indigo-600 underline">
              Forgot password?
            </Link>
          </div>
        </div>

        <button
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50 hover:opacity-90 transition"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="text-sm text-center text-gray-500">
          New employee?{" "}
          <Link href="/signup" className="text-indigo-600 font-medium underline">
            Request access
          </Link>
        </p>
      </form>
    </div>
  );
}
