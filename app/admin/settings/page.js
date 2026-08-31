"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import ImageUploader from "@/components/ImageUploader";

export default function AdminSettingsPage() {
  const supabase = createClient();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", true)
      .single();
    setSettings(data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg sm:text-xl font-bold">Settings</h1>

      <div className="bg-white rounded-xl shadow p-4 sm:p-6 space-y-3">
        <h2 className="font-semibold text-sm">Company Logo</h2>
        <p className="text-xs text-gray-400">
          Shown at the top of every page for both Admins and Sales Persons.
        </p>
        {saved && (
          <div className="text-sm text-green-700 bg-green-50 rounded p-2">
            Logo updated - it now shows everywhere in the app.
          </div>
        )}
        <ImageUploader
          bucket="branding"
          path="logo"
          currentUrl={settings?.logo_url}
          shape="square"
          size={80}
          label="Change Logo"
          onUploaded={async (url) => {
            const { error } = await supabase
              .from("app_settings")
              .update({ logo_url: url })
              .eq("id", true);
            if (error) {
              alert(`Could not save logo: ${error.message}`);
              return;
            }
            setSaved(true);
            load();
          }}
        />
      </div>
    </div>
  );
}
