"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const params = useSearchParams();
  const isPending = params.get("pending") === "1";
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Create the pending profile row - admin will see this as a request
    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      full_name: fullName,
      email,
      status: "pending",
    });

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  if (isPending || done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-4 text-center">
          <h1 className="text-xl font-bold">Request Sent</h1>
          <p className="text-gray-500 text-sm">
            Your access request has been sent. An admin needs to approve it
            before you can log in. Please check back later.
          </p>
          <Link href="/login" className="text-indigo-600 font-medium underline text-sm">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
      <form
        onSubmit={handleSignup}
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center">Request Access</h1>
        <p className="text-sm text-gray-500 text-center">
          New employee? Send a request to the admin.
        </p>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>
        )}

        <div>
          <label className="text-sm font-medium">Full Name</label>
          <input
            required
            className="mt-1 w-full border rounded-lg px-3 py-2"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            required
            className="mt-1 w-full border rounded-lg px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Password</label>
          <input
            type="password"
            required
            minLength={6}
            className="mt-1 w-full border rounded-lg px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg py-2 font-medium disabled:opacity-50 hover:opacity-90 transition"
        >
          {loading ? "Sending..." : "Send Request"}
        </button>

        <p className="text-sm text-center text-gray-500">
          Already approved?{" "}
          <Link href="/login" className="text-indigo-600 font-medium underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
