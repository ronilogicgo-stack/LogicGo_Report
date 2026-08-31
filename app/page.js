"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // Everything routes through this single listener (instead of a
    // separate getSession() call) so there's no race between a normal
    // "not logged in -> /login" redirect and Supabase's own
    // PASSWORD_RECOVERY event, which needs a moment to parse the
    // recovery link's token out of the URL first.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/reset-password");
        return;
      }

      if (event !== "INITIAL_SESSION" && event !== "SIGNED_IN") return;

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, is_sales_person, status")
        .eq("id", session.user.id)
        .single();

      if (!profile) {
        router.replace("/login");
      } else if (profile.is_admin) {
        router.replace("/admin");
      } else if (profile.is_sales_person && profile.status === "approved") {
        router.replace("/dashboard");
      } else {
        router.replace("/signup?pending=1");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  );
}
