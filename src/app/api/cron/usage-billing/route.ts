import { prisma } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { billUsageForTenant, previousMonthKey } from "@/lib/usage-billing";

/** Monthly (1st): adds last month's metered usage to each opted-in workspace's next Stripe invoice. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return new Response("unauthorized", { status: 401 });
  if (!stripeConfigured()) return Response.json({ skipped: "stripe not configured" });
  const key = previousMonthKey();
  const tenants = await prisma.tenant.findMany({ where: { passThroughUsage: true, stripeCustomerId: { not: null } }, select: { id: true } });
  const results: Record<string, unknown> = {};
  for (const t of tenants) {
    try { results[t.id] = await billUsageForTenant(t.id, key, stripe().invoiceItems as any); }
    catch (e) { results[t.id] = { error: (e as Error).message }; }
  }
  return Response.json({ month: key, results });
}
