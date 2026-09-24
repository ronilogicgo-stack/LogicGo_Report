import { NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabaseAdmin";

const NOTIFY_SECRET = "bf5675cffcb787c829be9b7218238fc1e121256bb9398adb";
const OWNER_EMAIL = "roni.logicgo@gmail.com";

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

  const { rma_id, event, previous_value, new_value } = await request.json();
  const service = createServiceClient();

  const { data: rma } = await service
    .from("rma_records")
    .select("rma_number, product_name, customer_name")
    .eq("id", rma_id)
    .single();
  if (!rma) return NextResponse.json({ ok: true, sent: 0 });

  const [{ data: grants }, { data: owner }] = await Promise.all([
    service.from("module_access").select("user_id").eq("module_key", "rma"),
    service.from("profiles").select("id").eq("email", OWNER_EMAIL).maybeSingle(),
  ]);

  const recipientIds = new Set((grants || []).map((g) => g.user_id));
  if (owner) recipientIds.add(owner.id);
  if (recipientIds.size === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { data: subs } = await service
    .from("push_subscriptions")
    .select("*")
    .in("user_id", Array.from(recipientIds));

  const title = event === "created" ? "New RMA Created" : "RMA Status Updated";
  const body =
    event === "created"
      ? `${rma.rma_number} - ${rma.product_name} (${rma.customer_name})`
      : `${rma.rma_number}: ${previous_value} → ${new_value}`;

  const payload = JSON.stringify({ title, body, url: `/rma/${rma_id}`, tag: `rma-${rma_id}` });

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
