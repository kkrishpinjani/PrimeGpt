import type { Channel } from "@prisma/client";
import { prisma } from "../db";
import { classifyInbound } from "../brain/inbox";
import { normPhone } from "../brain/rules";

/**
 * Record an inbound message (email poll, SMS poll, or webhook). Idempotent on externalId.
 * Returns null if we can't match a known person or it was already ingested.
 */
export async function ingestInbound(i: {
  tenantId: string; channel: Channel; externalId: string; threadKey?: string; subject?: string; body: string; email?: string; phone?: string;
}) {
  const dup = await prisma.message.findFirst({ where: { tenantId: i.tenantId, externalId: i.externalId, direction: "INBOUND" } });
  if (dup) return null;

  const person = i.email
    ? await prisma.candidate.findFirst({ where: { tenantId: i.tenantId, email: i.email.toLowerCase() } })
    : i.phone ? await prisma.candidate.findFirst({ where: { tenantId: i.tenantId, phone: { in: [i.phone, normPhone(i.phone)] } } }) : null;
  const contact = !person && i.email ? await prisma.contact.findFirst({ where: { tenantId: i.tenantId, email: i.email.toLowerCase() } }) : null;
  if (!person && !contact) return null;

  const cls = await classifyInbound(i.tenantId, i.body);
  await prisma.message.create({
    data: {
      tenantId: i.tenantId, candidateId: person?.id, contactId: contact?.id, channel: i.channel, direction: "INBOUND", status: "RECEIVED",
      subject: i.subject?.slice(0, 190), body: i.body.slice(0, 20_000), kind: "reply", classification: cls.label,
      externalId: i.externalId, threadKey: i.threadKey,
    },
  });

  if (cls.label === "unsubscribe") {
    await prisma.doNotContact.create({
      data: { tenantId: i.tenantId, email: person?.email ?? contact?.email ?? i.email?.toLowerCase(), phone: person?.phone ?? i.phone, linkedinUrl: person?.linkedinUrl, reason: "Opt-out via reply" },
    });
    if (person) await prisma.candidate.update({ where: { id: person.id }, data: { status: "REJECTED", stage: "do_not_contact" } });
  } else if (person) {
    await prisma.candidate.update({
      where: { id: person.id },
      data: { status: cls.label === "interested" || cls.label === "scheduling" ? "REPLIED" : person.status === "CONTACTED" ? "REPLIED" : person.status, stage: cls.label === "interested" ? "interested" : person.stage },
    });
    // Safe suggested reply is stored as a DRAFT: a human must approve it like any other outbound message.
    if (cls.suggestedReply) {
      await prisma.message.create({
        data: { tenantId: i.tenantId, candidateId: person.id, channel: i.channel, direction: "OUTBOUND", status: "DRAFT", kind: "reply", subject: i.channel === "EMAIL" ? `Re: ${i.subject ?? ""}`.slice(0, 190) : null, body: cls.suggestedReply, threadKey: i.threadKey },
      });
    }
  }
  return { label: cls.label };
}
