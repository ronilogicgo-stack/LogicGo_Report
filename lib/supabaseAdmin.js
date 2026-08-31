// =====================================================================
// SERVER-ONLY SUPABASE ADMIN CLIENT
// NEVER import this file from a "use client" component or anywhere
// that runs in the browser - it uses the Service Role key, which
// bypasses Row Level Security entirely and has full database access.
// It must only be used inside API routes (app/api/**/route.js), which
// run on the server.
// =====================================================================

import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Verifies a bearer access token belongs to a currently-flagged Admin.
 * Returns the admin's user id if valid, otherwise null.
 */
export async function verifyAdmin(accessToken) {
  if (!accessToken) return null;

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data: userData, error } = await anonClient.auth.getUser(accessToken);
  if (error || !userData?.user) return null;

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();

  return profile?.is_admin ? userData.user.id : null;
}
