"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import ImageUploader from "@/components/ImageUploader";

export default function MyProfilePage() {
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    location: "",
    employee_code: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [requestingEmail, setRequestingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    setProfile(p);
    setForm({
      full_name: p?.full_name || "",
      phone: p?.phone || "",
      location: p?.location || "",
      employee_code: p?.employee_code || "",
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaveError("");
    setSaved(false);
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        phone: form.phone,
        location: form.location,
        employee_code: form.employee_code,
      })
      .eq("id", profile.id);

    if (error) {
      setSaveError(error.message);
    } else {
      setSaved(true);
      load();
    }
    setSaving(false);
  }

  async function handleRequestEmailChange(e) {
    e.preventDefault();
    setEmailError("");
    setRequestingEmail(true);

    // 1. Kick off Supabase's real auth email change flow - this sends a
    //    confirmation link and only actually swaps the login credential
    //    once the person clicks it. This step is independent of Admin
    //    approval below (Supabase itself owns that verification step).
    const { error: authError } = await supabase.auth.updateUser({
      email: newEmail,
    });

    if (authError) {
      setEmailError(authError.message);
      setRequestingEmail(false);
      return;
    }

    // 2. Record the request in our own profile row and LOCK the account
    //    out of entries/edits until an Admin reviews it.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ requested_email: newEmail, email_change_pending: true })
      .eq("id", profile.id);

    if (profileError) {
      setEmailError(profileError.message);
    } else {
      setNewEmail("");
      load();
    }
    setRequestingEmail(false);
  }

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg sm:text-xl font-bold">My Profile</h1>

      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="font-semibold text-sm mb-3">Profile Photo</h2>
        {profile?.email_change_pending ? (
          <p className="text-sm text-gray-400">
            Locked until your pending email change is resolved.
          </p>
        ) : (
          <ImageUploader
            bucket="avatars"
            path={`${profile?.id}/avatar`}
            currentUrl={profile?.avatar_url}
            label="Change Photo"
            onUploaded={async (url) => {
              const { error } = await supabase
                .from("profiles")
                .update({ avatar_url: url })
                .eq("id", profile.id);
              if (error) alert(`Could not save photo: ${error.message}`);
              load();
            }}
          />
        )}
      </div>

      {profile?.email_change_pending && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl p-4 text-sm">
          Your email change request to <strong>{profile.requested_email}</strong>{" "}
          is pending admin approval. You cannot edit your profile or submit
          entries until it's resolved.
        </div>
      )}

      <form
        onSubmit={handleSaveProfile}
        className="bg-white rounded-xl shadow p-4 sm:p-6 space-y-4"
      >
        <h2 className="font-semibold text-sm">Profile Details</h2>

        {saveError && (
          <div className="text-sm text-red-600 bg-red-50 rounded p-2">{saveError}</div>
        )}
        {saved && (
          <div className="text-sm text-green-700 bg-green-50 rounded p-2">
            Saved successfully.
          </div>
        )}

        <Field label="Full Name">
          <input
            type="text"
            required
            disabled={profile?.email_change_pending}
            className="w-full border rounded-lg px-3 py-2 disabled:bg-gray-100"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </Field>

        <Field label="Phone Number">
          <input
            type="tel"
            disabled={profile?.email_change_pending}
            className="w-full border rounded-lg px-3 py-2 disabled:bg-gray-100"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>

        <Field label="Branch / Region">
          <input
            type="text"
            disabled={profile?.email_change_pending}
            className="w-full border rounded-lg px-3 py-2 disabled:bg-gray-100"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </Field>

        <Field label="Employee / Branch ID">
          <input
            type="text"
            disabled={profile?.email_change_pending}
            className="w-full border rounded-lg px-3 py-2 disabled:bg-gray-100"
            value={form.employee_code}
            onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
          />
        </Field>

        <button
          disabled={saving || profile?.email_change_pending}
          className="bg-black text-white rounded-lg px-5 py-2.5 text-sm disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </form>

      <form
        onSubmit={handleRequestEmailChange}
        className="bg-white rounded-xl shadow p-4 sm:p-6 space-y-4"
      >
        <h2 className="font-semibold text-sm">Email Address</h2>
        <p className="text-sm text-gray-500">
          Current: <span className="font-medium">{profile?.email}</span>
        </p>
        <p className="text-xs text-gray-400">
          Changing your email requires Admin approval, and Supabase will also
          send a confirmation link to the new address. Until both are done,
          keep signing in with your current email.
        </p>

        {emailError && (
          <div className="text-sm text-red-600 bg-red-50 rounded p-2">{emailError}</div>
        )}

        <Field label="New Email Address">
          <input
            type="email"
            required
            disabled={profile?.email_change_pending}
            className="w-full border rounded-lg px-3 py-2 disabled:bg-gray-100"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>

        <button
          disabled={requestingEmail || profile?.email_change_pending}
          className="border rounded-lg px-5 py-2.5 text-sm disabled:opacity-50"
        >
          {requestingEmail ? "Requesting..." : "Request Email Change"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
