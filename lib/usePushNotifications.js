"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabaseClient";

// Public VAPID key - safe to expose client-side (it's the "address"
// push messages get encrypted to; only the matching private key on the
// server, which stays a secret env var, can actually sign a message).
const VAPID_PUBLIC_KEY = "BH3QJ-BZEpnjOBe-cZirvOXc9Miw8gtVFf5EmwWplQhe3JHDhwUZX1zzibFScN52WfENy5WF5Y4UMlZQ-V8OBZ4";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** Call once per logged-in session (any role) to enable push
 * notifications on this device. Silently does nothing if the browser
 * doesn't support it, or the person hasn't granted permission yet -
 * it only asks once per browser, never nags on every page load. */
export function usePushNotifications(userId) {
  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;

    async function setup() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") return;
        }
        if (Notification.permission !== "granted") return;

        let subscription = await registration.pushManager.getSubscription();

        // If a subscription already exists but was created against a
        // DIFFERENT VAPID key than the one we're using now (e.g. the
        // key was rotated after an earlier test), it's permanently
        // stale - the server can never successfully sign a push for it.
        // Unsubscribe and create a fresh one against the current key.
        if (subscription) {
          const existingKey = subscription.options?.applicationServerKey
            ? btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey)))
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "")
            : null;
          const currentKeyNormalized = VAPID_PUBLIC_KEY.replace(/=+$/, "");
          if (existingKey && existingKey !== currentKeyNormalized) {
            await subscription.unsubscribe();
            subscription = null;
          }
        }

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }
        if (cancelled) return;

        const json = subscription.toJSON();
        const supabase = createClient();
        await supabase.from("push_subscriptions").upsert(
          {
            user_id: userId,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
          { onConflict: "endpoint" }
        );
      } catch (err) {
        // Non-fatal - the rest of the app works fine without push.
        console.warn("Push notification setup skipped:", err.message);
      }
    }
    setup();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
