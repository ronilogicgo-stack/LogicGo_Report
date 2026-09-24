import { NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabaseAdmin";

const NOTIFY_SECRET = "bf5675cffcb787c829be9b7218238fc1e121256bb9398adb";

export async function POST(request) {
  if (request.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return NextResponse.json({ error: "Push notifications not configured yet." }, { status: 501 });
  }
  webpush.setVapidDetails(
    "mailto:roni.logicgo@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const { user_id, entry_date } = await request.json();
  const service = createServiceClient();

  const [{ data: salesPerson }, { data: admins }] = await Promise.all([
    service.from("profiles").select("full_name").eq("id", user_id).single(),
    service.from("profiles").select("id").eq("is_admin", true),
  ]);

  const adminIds = (admins || []).map((a) => a.id);
  if (adminIds.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { data: subs } = await service.from("push_subscriptions").select("*").in("user_id", adminIds);

  const payload = JSON.stringify({
    title: "New Daily Entry",
    body: `${salesPerson?.full_name || "A sales person"} submitted a report for ${entry_date}`,
    url: "/admin/daily-report",
    tag: "daily-entry",
  });

  let sent = 0;
  await Promise.all(
    (subs || []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await service.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );

  return NextResponse.json({ ok: true, sent });
}
