"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    async function redirect() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

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
    }

    redirect();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  );
}
