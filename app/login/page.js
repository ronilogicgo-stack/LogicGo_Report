"use client";

import { Suspense, useState } from "react";
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
      .select("role, status")
      .eq("id", data.user.id)
      .single();

    if (!profile) {
      setError("Profile not found. Contact admin.");
      setLoading(false);
      return;
    }

    if (profile.role === "admin") {
      router.push("/admin");
    } else if (profile.status === "approved") {
      router.push("/dashboard");
    } else if (profile.status === "paused") {
      // Paused accounts are signed out immediately - they cannot use the
      // app until an admin resumes them, even though their password
      // still technically works.
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
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white rounded-xl shadow p-6 sm:p-8 space-y-4"
      >
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
            className="mt-1 w-full border rounded-lg px-3 py-2 text-base"
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
            className="mt-1 w-full border rounded-lg px-3 py-2 text-base"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          disabled={loading}
          className="w-full bg-black text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="text-sm text-center text-gray-500">
          New employee?{" "}
          <Link href="/signup" className="text-black font-medium underline">
            Request access
          </Link>
        </p>
      </form>
    </div>
  );
}
