import "dotenv/config";
import type { Run } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runEvent } from "@/lib/services/runs";
import { hasActiveAccess } from "@/lib/billing-gate";
import { startGateway } from "./gateway";
import { runSourcing } from "./jobs/sourcing";
import { runSend } from "./jobs/send";
import { runInboxWatch } from "./jobs/inbox";
import { runBrief, runOutreachDraft, runProspecting, runScoring } from "./jobs/misc";

/**
 * Persistent worker (WS4): hosts the executor gateway + the background job queue.
 * Run as a long-lived process (Fly.io / Railway / VPS). The Next.js app (Vercel) only enqueues Runs and renders them.
 */
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);
const STALE_MS = 15 * 60_000;
const MAX_ATTEMPTS = 3;
let active = 0;

const handlers: Record<string, (r: Run) => Promise<string>> = {
  SOURCING: runSourcing,
  SCORING: runScoring,
  BRIEF: runBrief,
  OUTREACH_DRAFT: runOutreachDraft,
  INBOX_WATCH: runInboxWatch,
  PROSPECTING: runProspecting,
  SEND_MESSAGE: runSend,
};

async function claim(): Promise<Run | null> {
  const next = await prisma.run.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (!next) return null;
  // atomic claim: only one worker can flip QUEUED → RUNNING
  const r = await prisma.run.updateMany({
    where: { id: next.id, status: "QUEUED" },
    data: { status: "RUNNING", lockedAt: new Date(), startedAt: next.startedAt ?? new Date(), attempts: { increment: 1 } },
  });
  return r.count ? prisma.run.findUnique({ where: { id: next.id } }) : null;
}

async function execute(run: Run) {
  try {
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: run.tenantId } });
    if (!hasActiveAccess(t)) throw new Error("Workspace subscription is not active");
    await runEvent(run.id, `Started ${run.type}`);
    const summary = await handlers[run.type](run);
    await prisma.run.update({ where: { id: run.id }, data: { status: "SUCCEEDED", progress: 100, summary, finishedAt: new Date(), lockedAt: null } });
    await runEvent(run.id, summary);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[worker] run ${run.id} (${run.type}) failed:`, msg);
    // Sends are NEVER auto-retried: they are not idempotent and a retry could double-send. A human retries explicitly.
    const retriable = run.type !== "SEND_MESSAGE" && run.attempts < MAX_ATTEMPTS && !/not active|offline|not found|not configured|cap|do-not-contact|only APPROVED|disclosure/i.test(msg);
    await prisma.run.update({
      where: { id: run.id },
      data: retriable ? { status: "QUEUED", lockedAt: null, error: msg.slice(0, 2000) } : { status: "FAILED", error: msg.slice(0, 2000), finishedAt: new Date(), lockedAt: null },
    });
    await runEvent(run.id, `${retriable ? "Retrying after error" : "Failed"}: ${msg}`, "error");
  }
}

async function tick() {
  while (active < CONCURRENCY) {
    const run = await claim();
    if (!run) break;
    active++;
    execute(run).finally(() => { active--; });
  }
}

/** Requeue runs whose worker died mid-flight. */
async function recoverStale() {
  const cutoff = new Date(Date.now() - STALE_MS);
  const stale = await prisma.run.findMany({ where: { status: "RUNNING", lockedAt: { lt: cutoff } } });
  for (const r of stale) {
    if (r.type === "SEND_MESSAGE") {
      // Unknown whether the message went out. Fail it loudly instead of risking a duplicate send.
      const messageId = (r.params as any)?.messageId;
      if (messageId) await prisma.message.updateMany({ where: { id: messageId, status: { in: ["APPROVED", "SENDING"] } }, data: { status: "FAILED", error: "Worker stopped mid-send; check the sent folder before retrying" } });
      await prisma.run.update({ where: { id: r.id }, data: { status: "FAILED", error: "Worker died mid-send", finishedAt: new Date() } });
      continue;
    }
    await prisma.run.update({ where: { id: r.id }, data: r.attempts >= MAX_ATTEMPTS ? { status: "FAILED", error: "Worker died", finishedAt: new Date() } : { status: "QUEUED", lockedAt: null } });
  }
}

/** Opt-in autonomy: only tenants that enabled scheduled inbox watch get polled. Default is on-demand only. */
async function scheduleAutonomy() {
  const tenants = await prisma.tenant.findMany({ where: { autonomyInboxWatch: true } });
  for (const t of tenants) {
    if (!hasActiveAccess(t)) continue;
    const open = await prisma.run.findFirst({ where: { tenantId: t.id, type: "INBOX_WATCH", status: { in: ["QUEUED", "RUNNING"] } } });
    const recent = await prisma.run.findFirst({ where: { tenantId: t.id, type: "INBOX_WATCH", createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
    if (!open && !recent) await prisma.run.create({ data: { tenantId: t.id, type: "INBOX_WATCH", params: {} } });
  }
}

async function main() {
  startGateway(Number(process.env.GATEWAY_PORT ?? 8009));
  await prisma.executorDevice.updateMany({ data: { online: false } }); // truth is rebuilt as devices reconnect
  await recoverStale();
  setInterval(() => tick().catch((e) => console.error("[worker] tick", e)), 2000);
  setInterval(() => recoverStale().catch(() => {}), 60_000);
  setInterval(() => scheduleAutonomy().catch((e) => console.error("[worker] autonomy", e)), 60_000);
  console.log(`[worker] up. concurrency=${CONCURRENCY}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
