import type { Prisma, RunType } from "@prisma/client";
import { prisma } from "../db";

/** The web app only ever *enqueues*; the persistent worker executes (Vercel functions are too short-lived). */
export async function enqueueRun(tenantId: string, type: RunType, params: Prisma.InputJsonValue, opts: { searchId?: string; userId?: string } = {}) {
  return prisma.run.create({
    data: { tenantId, type, params, searchId: opts.searchId, createdById: opts.userId, status: "QUEUED" },
  });
}

export async function runEvent(runId: string, message: string, level: "info" | "warn" | "error" = "info") {
  await prisma.runEvent.create({ data: { runId, message: message.slice(0, 4000), level } }).catch(() => {});
}
