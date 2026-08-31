"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-4">
        <h1 className="text-2xl font-bold text-center">Reset Password</h1>

        {sent ? (
          <>
            <p className="text-sm text-gray-600 text-center">
              If an account exists for <strong>{email}</strong>, a password
              reset link has been sent. Check your inbox (and spam folder).
            </p>
            <Link
              href="/login"
              className="block text-center text-sm text-indigo-600 font-medium underline"
            >
              Back to login
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-500 text-center">
              Enter your email and we'll send you a link to reset your
              password.
            </p>

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

            <button
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50 hover:opacity-90 transition"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <p className="text-sm text-center text-gray-500">
              <Link href="/login" className="text-indigo-600 font-medium underline">
                Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
