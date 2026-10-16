import { prisma } from "@/lib/db";
import { hasActiveAccess } from "@/lib/billing-gate";
import { safeEqual } from "@/lib/crypto";

/** Optional external scheduler (e.g. Vercel Cron) as a backup to the worker's own scheduler. Opt-in tenants only. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) {
    return new Response("unauthorized", { status: 401 });
  }
  const tenants = await prisma.tenant.findMany({ where: { autonomyInboxWatch: true } });
  let n = 0;
  for (const t of tenants) {
    if (!hasActiveAccess(t)) continue;
    const open = await prisma.run.findFirst({ where: { tenantId: t.id, type: "INBOX_WATCH", status: { in: ["QUEUED", "RUNNING"] } } });
    if (!open) {
      await prisma.run.create({ data: { tenantId: t.id, type: "INBOX_WATCH", params: {} } });
      n++;
    }
  }
  return Response.json({ enqueued: n });
}
