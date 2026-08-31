import { NextResponse } from "next/server";
import { createServiceClient, verifyAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const adminId = await verifyAdmin(token);

    if (!adminId) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId." }, { status: 400 });
    }
    if (userId === adminId) {
      return NextResponse.json(
        { error: "You cannot delete your own account." },
        { status: 400 }
      );
    }

    const service = createServiceClient();

    // Deleting the auth user cascades automatically to the profiles row,
    // and from there to daily_entries and monthly_targets (all set up
    // with ON DELETE CASCADE) - so this one call removes EVERYTHING for
    // this person. It also frees up their email address for reuse,
    // since Supabase Auth's email uniqueness is tied to the deleted
    // auth.users row, not just our own profiles table.
    const { error } = await service.auth.admin.deleteUser(userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Unknown server error." },
      { status: 500 }
    );
  }
}
