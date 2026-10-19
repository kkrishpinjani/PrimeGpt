import type { Run } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DncError, draftOutreach } from "@/lib/brain/outreach";
import { runEvent } from "@/lib/services/runs";

const STOP_STATUSES = ["REPLIED", "INTERVIEWING", "PLACED", "REJECTED"] as const;

/**
 * Scheduled behaviour (opt-in per workspace). For outreach that has gone unanswered for `followupDays`,
 * prepare a follow-up as a DRAFT. It never sends: a recruiter still approves it in Outreach (approval gate is constant).
 * Idempotent: re-running creates nothing new for messages that already have a follow-up.
 */
export async function runFollowupDraft(run: Run) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: run.tenantId } });
  const cutoff = new Date(Date.now() - tenant.followupDays * 86_400_000);
  const senderName = ((run.params as any)?.userName as string | undefined) ?? tenant.brandName ?? tenant.name;

  const sent = await prisma.message.findMany({
    where: { tenantId: tenant.id, direction: "OUTBOUND", status: "SENT", kind: { in: ["outreach", "followup"] }, candidateId: { not: null }, sentAt: { lt: cutoff } },
    include: { candidate: { include: { jobOrder: true } } },
    orderBy: { sentAt: "asc" },
    take: 300,
  });

  let made = 0, skipped = 0;
  for (const m of sent) {
    const c = m.candidate;
    if (!c || (STOP_STATUSES as readonly string[]).includes(c.status)) { skipped++; continue; }
    // Only the latest sent message in a chain can be followed up
    if (await prisma.message.findFirst({ where: { tenantId: tenant.id, followupOfId: m.id } })) { skipped++; continue; }
    // They answered after we wrote
    if (await prisma.message.findFirst({ where: { tenantId: tenant.id, candidateId: c.id, direction: "INBOUND", createdAt: { gt: m.sentAt ?? m.createdAt } } })) { skipped++; continue; }
    // Cap follow-ups per person and channel; never stack drafts
    const chain = await prisma.message.count({ where: { tenantId: tenant.id, candidateId: c.id, channel: m.channel, kind: "followup", status: { in: ["DRAFT", "APPROVED", "SENDING", "SENT"] } } });
    if (chain >= tenant.maxFollowups) { skipped++; continue; }
    if (await prisma.message.findFirst({ where: { tenantId: tenant.id, candidateId: c.id, channel: m.channel, direction: "OUTBOUND", status: "DRAFT" } })) { skipped++; continue; }

    try {
      const d = await draftOutreach({ tenant, senderName, candidate: c, job: c.jobOrder, channel: m.channel, followupOf: { body: m.body } });
      await prisma.message.create({
        data: {
          tenantId: tenant.id, candidateId: c.id, channel: m.channel, direction: "OUTBOUND", status: "DRAFT", kind: "followup", followupOfId: m.id, threadKey: m.threadKey,
          subject: m.channel === "EMAIL" ? `Re: ${m.subject ?? ""}`.slice(0, 190) : d.subject, body: d.body,
        },
      });
      made++;
    } catch (e) {
      skipped++;
      if (!(e instanceof DncError)) await runEvent(run.id, `${c.fullName}: ${(e as Error).message}`, "warn");
    }
  }
  return `Prepared ${made} follow-up drafts (${skipped} skipped). Review and approve them in Outreach.`;
}
