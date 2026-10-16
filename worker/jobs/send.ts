import type { Run } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasActiveAccess } from "@/lib/billing-gate";
import { isDoNotContact } from "@/lib/brain/rules";
import { sendGmail } from "@/lib/integrations/google";
import { sendSms } from "@/lib/integrations/quo";
import { runEvent } from "@/lib/services/runs";
import { hands, handsStatus } from "../gateway";
import { sendLinkedInMessage } from "../drivers/browser-sources";

const DAILY_CAP = { EMAIL: 150, SMS: 100, LINKEDIN: 25 } as const;
const USAGE_KIND = { EMAIL: "email", SMS: "sms", LINKEDIN: "inmail" } as const;

/**
 * The single place any outbound message leaves the system. Enforces, in order:
 * approval gate → active subscription → do-not-contact → daily caps → channel send → event log.
 */
export async function runSend(run: Run) {
  const messageId = (run.params as any)?.messageId as string;
  const m = await prisma.message.findFirst({ where: { id: messageId, tenantId: run.tenantId }, include: { candidate: true, contact: true, tenant: true } });
  if (!m) throw new Error("Message not found");
  if (m.status === "SENT") return "Already sent";
  if (m.status !== "APPROVED" && m.status !== "SENDING") throw new Error(`Message is ${m.status}; only APPROVED messages can be sent`);
  if (!m.approvedById || !m.approvedAt) throw new Error("Message has no approval record");
  if (!hasActiveAccess(m.tenant)) throw new Error("Subscription is not active");

  const to = m.candidate ?? m.contact;
  if (!to) throw new Error("Message has no recipient");
  const fail = async (reason: string) => {
    await prisma.message.update({ where: { id: m.id }, data: { status: "FAILED", error: reason.slice(0, 500) } });
    await runEvent(run.id, reason, "error");
    throw new Error(reason);
  };

  if (await isDoNotContact(m.tenantId, { email: to.email, phone: to.phone, linkedinUrl: to.linkedinUrl })) return fail("Recipient is on the do-not-contact list (re-checked at send time)");

  const since = new Date(); since.setHours(0, 0, 0, 0);
  const sentToday = await prisma.usageEvent.count({ where: { tenantId: m.tenantId, kind: USAGE_KIND[m.channel], createdAt: { gte: since } } });
  if (sentToday >= DAILY_CAP[m.channel]) return fail(`Daily ${m.channel} cap (${DAILY_CAP[m.channel]}) reached; will not send more today`);

  await prisma.message.update({ where: { id: m.id }, data: { status: "SENDING", error: null } });
  try {
    let externalId: string | undefined, threadKey: string | undefined;
    if (m.channel === "EMAIL") {
      if (!to.email) throw new Error("Recipient has no email address");
      const r = await sendGmail(m.tenantId, { to: to.email, subject: m.subject ?? "(no subject)", body: m.body });
      externalId = r.id; threadKey = r.threadId;
    } else if (m.channel === "SMS") {
      if (!to.phone) throw new Error("Recipient has no phone number");
      const r = await sendSms(m.tenantId, to.phone, m.body);
      externalId = r.id; threadKey = `sms:${to.phone}`;
    } else {
      if (!to.linkedinUrl) throw new Error("Recipient has no LinkedIn URL");
      if (!handsStatus(m.tenantId).online) throw new Error("Local helper is offline; start it and retry");
      await sendLinkedInMessage(hands(m.tenantId), to.linkedinUrl, m.subject, m.body);
      threadKey = `li:${to.linkedinUrl}`;
    }
    await prisma.message.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), externalId, threadKey: threadKey ?? m.threadKey } });
    await prisma.usageEvent.create({ data: { tenantId: m.tenantId, kind: USAGE_KIND[m.channel], quantity: 1, meta: { messageId: m.id } } });
    if (m.candidateId && m.direction === "OUTBOUND" && m.kind !== "reply") {
      await prisma.candidate.updateMany({ where: { id: m.candidateId, tenantId: m.tenantId, status: { in: ["NEW", "SAVED"] } }, data: { status: "CONTACTED", stage: "contacted" } });
    }
    return `Sent ${m.channel} message`;
  } catch (e) {
    return fail((e as Error).message);
  }
}
