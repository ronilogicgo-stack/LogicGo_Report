"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Clicking the emailed reset link lands here with a recovery
    // session already active - just confirm one exists before showing
    // the form (Supabase handles parsing the link's token internally).
    supabase.auth.getSession().then(({ data: { session } }) => {
      setReady(!!session);
      if (!session) {
        setError(
          "This reset link is invalid or has expired. Please request a new one."
        );
      }
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-4">
        <h1 className="text-2xl font-bold text-center">Set New Password</h1>

        {done ? (
          <p className="text-sm text-green-700 bg-green-50 rounded p-3 text-center">
            Password updated! Redirecting to login...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>
            )}

            <div>
              <label className="text-sm font-medium">New Password</label>
              <input
                type="password"
                required
                disabled={!ready}
                autoComplete="new-password"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-base disabled:bg-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Confirm New Password</label>
              <input
                type="password"
                required
                disabled={!ready}
                autoComplete="new-password"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-base disabled:bg-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              disabled={loading || !ready}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50 hover:opacity-90 transition"
            >
              {loading ? "Saving..." : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
