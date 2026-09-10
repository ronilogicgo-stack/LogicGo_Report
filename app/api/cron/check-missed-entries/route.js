import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseAdmin";

/**
 * Returns YYYY-MM-DD for "today" in Asia/Dhaka (UTC+6, no DST), computed
 * by shifting the current UTC instant forward 6 hours and reading its
 * UTC calendar date - that shifted calendar date IS the Dhaka date.
 */
function dhakaDateKey(date = new Date()) {
  const shifted = new Date(date.getTime() + 6 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function addDays(dateKey, delta) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function isFriday(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay() === 5;
}

/**
 * Runs every night at 00:01 Asia/Dhaka (see vercel.json - 18:01 UTC).
 * Checks YESTERDAY (Dhaka calendar date) for every active sales person:
 *   - Friday and nothing entered  -> auto-fills a 'holiday' row tagged
 *     "Friday", no admin notification (this is expected, not a miss).
 *   - Any other day and nothing entered -> creates an admin_notifications
 *     row so an Admin can resolve it (Holiday / Leave / Custom / Request).
 * Safe to re-run: unique constraints on both tables mean re-running for
 * the same day is a no-op for anyone already handled.
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const yesterday = addDays(dhakaDateKey(), -1);
  const friday = isFriday(yesterday);

  const { data: people, error: peopleError } = await supabase
    .from("profiles")
    .select("id, full_name, created_at")
    .eq("is_sales_person", true)
    .eq("status", "approved");

  if (peopleError) {
    return NextResponse.json({ error: peopleError.message }, { status: 500 });
  }

  // Only people who had already joined by that date - a brand new hire
  // can't have "missed" a day before they existed.
  const eligible = (people || []).filter(
    (p) => !p.created_at || p.created_at.slice(0, 10) <= yesterday
  );

  if (eligible.length === 0) {
    return NextResponse.json({ checked: yesterday, missed: 0, holidays: 0 });
  }

  const ids = eligible.map((p) => p.id);
  const { data: existingEntries, error: entriesError } = await supabase
    .from("daily_entries")
    .select("user_id")
    .eq("entry_date", yesterday)
    .in("user_id", ids);

  if (entriesError) {
    return NextResponse.json({ error: entriesError.message }, { status: 500 });
  }

  const hasEntry = new Set((existingEntries || []).map((e) => e.user_id));
  const missing = eligible.filter((p) => !hasEntry.has(p.id));

  let holidayCount = 0;
  let notifiedCount = 0;

  if (missing.length > 0) {
    if (friday) {
      const rows = missing.map((p) => ({
        user_id: p.id,
        entry_date: yesterday,
        entry_type: "holiday",
        remarks: "Friday",
      }));
      const { error } = await supabase
        .from("daily_entries")
        .upsert(rows, { onConflict: "user_id,entry_date", ignoreDuplicates: true });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      holidayCount = rows.length;
    } else {
      const rows = missing.map((p) => ({
        type: "missed_entry",
        user_id: p.id,
        entry_date: yesterday,
        message: `${p.full_name} did not submit a daily report for ${yesterday}.`,
      }));
      const { error } = await supabase
        .from("admin_notifications")
        .upsert(rows, {
          onConflict: "user_id,entry_date,type",
          ignoreDuplicates: true,
        });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      notifiedCount = rows.length;
    }
  }

  return NextResponse.json({
    checked: yesterday,
    wasFriday: friday,
    holidaysAutoFilled: holidayCount,
    notificationsCreated: notifiedCount,
  });
}
