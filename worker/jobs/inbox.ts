import type { Run } from "@prisma/client";
import { prisma } from "@/lib/db";
import { classifyInbound } from "@/lib/brain/inbox";
import { normPhone } from "@/lib/brain/rules";
import { labelThread, pollInbox } from "@/lib/integrations/google";
import { getSecret } from "@/lib/integrations/store";
import { pollSms } from "@/lib/integrations/quo";
import { ingestInbound } from "@/lib/services/inbound";
import { runEvent } from "@/lib/services/runs";

/** Inbox watch: poll email + SMS, classify replies, label, and draft SAFE responses (never auto-sent). */
export async function runInboxWatch(run: Run) {
  const { tenantId } = run;
  const last = await prisma.run.findFirst({ where: { tenantId, type: "INBOX_WATCH", status: "SUCCEEDED", id: { not: run.id } }, orderBy: { finishedAt: "desc" } });
  const since = ((run.params as any)?.sinceMs as number | undefined) ?? (last?.finishedAt?.getTime() ?? Date.now() - 24 * 3600_000);
  let n = 0;

  if (await getSecret(tenantId, "gmail")) {
    try {
      for (const e of await pollInbox(tenantId, since)) {
        const addr = (e.from.match(/<([^>]+)>/)?.[1] ?? e.from).trim().toLowerCase();
        const res = await ingestInbound({ tenantId, channel: "EMAIL", externalId: e.id, threadKey: e.threadId, subject: e.subject, body: e.body, email: addr });
        if (res) { n++; await labelThread(tenantId, e.threadId, `RecruitGPT/${res.label}`).catch(() => {}); }
      }
    } catch (e) { await runEvent(run.id, `Email poll failed: ${(e as Error).message}`, "error"); }
  }

  if (await getSecret(tenantId, "quo")) {
    try {
      const sentTo = await prisma.message.findMany({ where: { tenantId, channel: "SMS", status: "SENT" }, select: { candidate: { select: { phone: true } } }, distinct: ["candidateId"], take: 200 });
      const phones = sentTo.map((x) => x.candidate?.phone).filter(Boolean) as string[];
      for (const s of await pollSms(tenantId, since, phones)) {
        const res = await ingestInbound({ tenantId, channel: "SMS", externalId: s.id, threadKey: `sms:${s.from}`, body: s.text, phone: normPhone(s.from) });
        if (res) n++;
      }
    } catch (e) { await runEvent(run.id, `SMS poll failed: ${(e as Error).message}`, "error"); }
  }
  return `Processed ${n} new replies`;
}
export { classifyInbound };
