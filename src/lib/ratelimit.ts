import { prisma } from "./db";

/** Fixed-window limiter stored in MySQL so it works across instances. Returns true if allowed. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (!row || row.resetAt < now) {
    await prisma.rateLimit.upsert({ where: { key }, create: { key, count: 1, resetAt }, update: { count: 1, resetAt } });
    return true;
  }
  if (row.count >= limit) return false;
  await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return true;
}
