import { safeEqual } from "@/lib/crypto";
import { quoWebhookToken } from "@/lib/integrations/quo-token";
import { ingestInbound } from "@/lib/services/inbound";
import { normPhone } from "@/lib/brain/rules";

/** Quo/OpenPhone `message.received` webhook. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tenantId = token.split(".")[0];
  if (!tenantId || !safeEqual(token, quoWebhookToken(tenantId))) return new Response("unauthorized", { status: 401 });
  const body: any = await req.json().catch(() => null);
  const m = body?.data?.object;
  if (body?.type !== "message.received" || !m || m.direction !== "incoming") return Response.json({ ignored: true });
  await ingestInbound({
    tenantId,
    channel: "SMS",
    externalId: String(m.id),
    threadKey: `sms:${m.from}`,
    body: String(m.text ?? m.body ?? ""),
    phone: normPhone(String(m.from)),
  });
  return Response.json({ ok: true });
}
