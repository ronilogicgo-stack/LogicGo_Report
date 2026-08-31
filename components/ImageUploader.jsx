"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";

/**
 * A small, reusable image upload widget backed by Supabase Storage.
 * Used for both the company logo (bucket="branding") and a person's
 * profile photo (bucket="avatars"). Always uploads to a FIXED path per
 * subject (so re-uploading replaces the old image) and appends a
 * cache-busting timestamp to the public URL so the new image shows up
 * immediately instead of a stale cached one.
 */
export default function ImageUploader({
  bucket,
  path, // e.g. `${userId}/avatar` or `logo` - extension is added automatically
  currentUrl,
  onUploaded,
  shape = "circle", // "circle" | "square"
  size = 96,
  label = "Upload Image",
}) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);

    const ext = file.name.split(".").pop();
    const fullPath = `${path}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fullPath, file, { upsert: true, cacheControl: "3600" });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
    const bustCacheUrl = `${data.publicUrl}?t=${Date.now()}`;
    onUploaded(bustCacheUrl);
    setUploading(false);
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className={`bg-gray-100 border flex items-center justify-center overflow-hidden shrink-0 ${
          shape === "circle" ? "rounded-full" : "rounded-lg"
        }`}
        style={{ width: size, height: size }}
      >
        {currentUrl ? (
          <img src={currentUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-gray-400 text-xs text-center px-2">No image</span>
        )}
      </div>
      <div>
        <label className="inline-block cursor-pointer text-sm border rounded-lg px-3 py-2 hover:bg-gray-50">
          {uploading ? "Uploading..." : label}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={handleFileChange}
          />
        </label>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  );
}
