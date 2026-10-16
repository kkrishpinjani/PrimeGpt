import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db";

/**
 * Central, platform-owned AI access (WS4/WS7). The key lives only in server env.
 * Every call is metered to the tenant and checked against the tenant's monthly AI budget.
 */
export class AiUnavailable extends Error {}
export class AiBudgetExceeded extends Error {}

let client: Anthropic | null = null;
const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiUnavailable("ANTHROPIC_API_KEY not configured");
  return (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
};
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

// Rough $/MTok used only for cost-control metering. Tune to the contracted model price.
const PRICE_IN = Number(process.env.AI_PRICE_IN_PER_MTOK ?? 3);
const PRICE_OUT = Number(process.env.AI_PRICE_OUT_PER_MTOK ?? 15);

export async function monthlyAiSpendCents(tenantId: string) {
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  const r = await prisma.usageEvent.aggregate({
    _sum: { costCents: true },
    where: { tenantId, kind: "ai_tokens", createdAt: { gte: from } },
  });
  return r._sum.costCents ?? 0;
}

export async function complete(opts: {
  tenantId: string;
  feature: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const t = await prisma.tenant.findUniqueOrThrow({
    where: { id: opts.tenantId },
    select: { aiMonthlyBudgetCents: true },
  });
  if ((await monthlyAiSpendCents(opts.tenantId)) >= t.aiMonthlyBudgetCents) {
    throw new AiBudgetExceeded("Monthly AI budget reached");
  }
  const res = await getClient().messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
    max_tokens: opts.maxTokens ?? 1500,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const inTok = res.usage.input_tokens;
  const outTok = res.usage.output_tokens;
  const cents = Math.ceil(((inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000) * 100);
  await prisma.usageEvent.create({
    data: {
      tenantId: opts.tenantId,
      kind: "ai_tokens",
      quantity: inTok + outTok,
      costCents: cents,
      meta: { feature: opts.feature, inTok, outTok },
    },
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

/** Ask for JSON and parse defensively. */
export async function completeJson<T>(opts: Parameters<typeof complete>[0]): Promise<T> {
  const text = await complete({
    ...opts,
    system: opts.system + "\n\nRespond with a single valid JSON object only. No prose, no code fences.",
  });
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Model did not return JSON");
  return JSON.parse(m[0]) as T;
}
