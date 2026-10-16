import { prisma } from "../db";
import { decryptJson, encryptJson } from "../crypto";

export type Provider = "gmail" | "gcalendar" | "quo" | "apollo" | "exa";

/** Providers where the platform supplies a default key if the tenant brings none (decision: platform-provided at launch). */
const PLATFORM_FALLBACK: Partial<Record<Provider, () => any | null>> = {
  apollo: () => (process.env.APOLLO_API_KEY ? { apiKey: process.env.APOLLO_API_KEY } : null),
  exa: () => (process.env.EXA_API_KEY ? { apiKey: process.env.EXA_API_KEY } : null),
};

export async function saveSecret(tenantId: string, provider: Provider, secret: unknown, accountLabel?: string) {
  const enc = encryptJson(secret);
  await prisma.integration.upsert({
    where: { tenantId_provider: { tenantId, provider } },
    create: { tenantId, provider, secret: enc, accountLabel, status: "connected" },
    update: { secret: enc, accountLabel, status: "connected" },
  });
}

export async function getSecret<T = any>(tenantId: string, provider: Provider): Promise<T | null> {
  const row = await prisma.integration.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  if (row && row.status === "connected") return decryptJson<T>(row.secret);
  return PLATFORM_FALLBACK[provider]?.() ?? null;
}

export async function removeSecret(tenantId: string, provider: Provider) {
  await prisma.integration.deleteMany({ where: { tenantId, provider } });
}

export async function listConnected(tenantId: string) {
  const rows = await prisma.integration.findMany({
    where: { tenantId },
    select: { provider: true, accountLabel: true, status: true, updatedAt: true },
  });
  return rows; // never returns secrets
}
