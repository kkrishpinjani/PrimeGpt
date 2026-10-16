import { prisma } from "./db";
export async function audit(action: string, o: { tenantId?: string | null; userId?: string | null; detail?: string; ip?: string | null } = {}) {
  try {
    await prisma.auditLog.create({ data: { action, tenantId: o.tenantId ?? null, userId: o.userId ?? null, detail: o.detail?.slice(0, 2000), ip: o.ip ?? null } });
  } catch { /* auditing must never break a request */ }
}
