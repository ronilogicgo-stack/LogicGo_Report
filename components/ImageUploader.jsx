"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";

/** Resizes/compresses an image in the browser before upload, so a
 * multi-megabyte phone photo doesn't turn into a multi-megabyte file
 * that has to be re-downloaded on every single page (it shows in the
 * navbar everywhere). Returns a JPEG Blob capped at `maxSize` px on the
 * longest side - plenty for a logo or avatar shown at 32-96px. */
function compressImage(file, maxSize = 400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  path, // e.g. `${userId}/avatar` or `logo` - a fixed .jpg extension is used
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

    try {
      const compressed = await compressImage(file);
      const fullPath = `${path}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fullPath, compressed, {
          upsert: true,
          cacheControl: "3600",
          contentType: "image/jpeg",
        });

      if (uploadError) {
        setError(uploadError.message);
        setUploading(false);
        return;
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
      const bustCacheUrl = `${data.publicUrl}?t=${Date.now()}`;
      onUploaded(bustCacheUrl);
    } catch (err) {
      setError("Could not process that image. Try a different file.");
    }
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
