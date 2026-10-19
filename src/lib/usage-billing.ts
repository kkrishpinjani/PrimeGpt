import { prisma } from "./db";

/**
 * Usage pass-through (scope WS6: "metered add-ons if AI usage is passed through"; §8: "whether AI/sourcing costs are
 * passed through or absorbed"). Off by default. When a workspace has passThroughUsage = true, last month's usage is added
 * to its next Stripe invoice as invoice items. The scope gives NO rates, so they are env-configured and default to
 * at-cost AI and free everything else:
 *   USAGE_AI_MARKUP (1 = at cost), USAGE_INMAIL_CENTS, USAGE_SMS_CENTS, USAGE_EMAIL_CENTS, USAGE_RUN_CENTS
 */
const num = (k: string, d: number) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && process.env[k] !== undefined && process.env[k] !== "" ? v : d;
};

export type ChargeLine = { description: string; amountCents: number };

export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
export const monthRange = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
};
export const previousMonthKey = (now = new Date()) => monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));

export async function computeUsageCharges(tenantId: string, key: string): Promise<{ lines: ChargeLine[]; totalCents: number }> {
  const { from, to } = monthRange(key);
  const rows = await prisma.usageEvent.groupBy({
    by: ["kind"], where: { tenantId, createdAt: { gte: from, lt: to } }, _sum: { quantity: true, costCents: true }, _count: { _all: true },
  });
  const by = new Map(rows.map((r) => [r.kind, r]));
  const lines: ChargeLine[] = [];
  const add = (description: string, amountCents: number) => { if (amountCents > 0) lines.push({ description, amountCents: Math.round(amountCents) }); };

  const ai = by.get("ai_tokens");
  if (ai) add(`AI usage ${key} (${(ai._sum.quantity ?? 0).toLocaleString("en-US")} tokens)`, (ai._sum.costCents ?? 0) * num("USAGE_AI_MARKUP", 1));
  const per = (kind: string, label: string, envKey: string) => {
    const r = by.get(kind);
    if (r) add(`${label} ${key} (${r._count._all})`, r._count._all * num(envKey, 0));
  };
  per("inmail", "LinkedIn InMail", "USAGE_INMAIL_CENTS");
  per("sms", "SMS", "USAGE_SMS_CENTS");
  per("email", "Email", "USAGE_EMAIL_CENTS");
  per("sourcing_run", "Sourcing runs", "USAGE_RUN_CENTS");
  return { lines, totalCents: lines.reduce((a, l) => a + l.amountCents, 0) };
}

type InvoiceItems = { create: (p: { customer: string; amount: number; currency: string; description: string }, o: { idempotencyKey: string }) => Promise<unknown> };

/** Bills one workspace for one month. Safe to call twice: guarded by lastUsageBilledMonth and Stripe idempotency keys. */
export async function billUsageForTenant(tenantId: string, key: string, invoiceItems: InvoiceItems) {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (!t.passThroughUsage || !t.stripeCustomerId) return { skipped: "not enabled or no Stripe customer" as const };
  if (t.lastUsageBilledMonth && t.lastUsageBilledMonth >= key) return { skipped: "already billed" as const };
  const { lines, totalCents } = await computeUsageCharges(tenantId, key);
  for (const [i, l] of lines.entries()) {
    await invoiceItems.create(
      { customer: t.stripeCustomerId, amount: l.amountCents, currency: "usd", description: l.description },
      { idempotencyKey: `usage-${tenantId}-${key}-${i}` },
    );
  }
  await prisma.tenant.update({ where: { id: tenantId }, data: { lastUsageBilledMonth: key } });
  return { billed: lines.length, totalCents };
}
