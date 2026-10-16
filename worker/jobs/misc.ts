import type { Run } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateBrief } from "@/lib/brain/brief";
import { DncError, draftOutreach } from "@/lib/brain/outreach";
import { draftProspectIntro } from "@/lib/brain/prospect";
import { apolloPeople } from "@/lib/integrations/data-sources";
import { scoreAndSave } from "@/lib/services/candidates";
import { runEvent } from "@/lib/services/runs";

export async function runScoring(run: Run) {
  const p = run.params as any;
  const job = await prisma.jobOrder.findFirst({ where: { id: p.jobOrderId, tenantId: run.tenantId } });
  if (!job) throw new Error("Job order not found");
  const cands = await prisma.candidate.findMany({
    where: { tenantId: run.tenantId, jobOrderId: job.id, ...(p.candidateIds ? { id: { in: p.candidateIds } } : p.onlyUnscored ? { fitScore: null } : {}) },
    take: 500,
  });
  let i = 0;
  for (const c of cands) {
    await scoreAndSave(run.tenantId, job, c);
    await prisma.run.update({ where: { id: run.id }, data: { progress: Math.round((++i / cands.length) * 100) } });
  }
  return `Scored ${cands.length} candidates`;
}

export async function runBrief(run: Run) {
  const c = await prisma.candidate.findFirst({ where: { id: (run.params as any).candidateId, tenantId: run.tenantId }, include: { jobOrder: true } });
  if (!c) throw new Error("Candidate not found");
  const brief = await generateBrief(run.tenantId, c.jobOrder, c);
  await prisma.candidate.update({ where: { id: c.id }, data: { brief } });
  return "Brief generated";
}

/** Bulk-draft outreach for the top candidates. Drafts only: approval is always a human step. */
export async function runOutreachDraft(run: Run) {
  const p = run.params as { jobOrderId: string; channel: "EMAIL" | "SMS" | "LINKEDIN"; minScore?: number; limit?: number; userName: string };
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: run.tenantId } });
  const job = await prisma.jobOrder.findFirst({ where: { id: p.jobOrderId, tenantId: run.tenantId } });
  if (!job) throw new Error("Job order not found");
  const cands = await prisma.candidate.findMany({
    where: { tenantId: run.tenantId, jobOrderId: job.id, status: { in: ["NEW", "SAVED"] }, fitScore: { gte: p.minScore ?? 60 } },
    orderBy: { fitScore: "desc" }, take: p.limit ?? 20,
  });
  let made = 0, skipped = 0;
  for (const c of cands) {
    const has = await prisma.message.findFirst({ where: { tenantId: run.tenantId, candidateId: c.id, channel: p.channel, direction: "OUTBOUND", status: { in: ["DRAFT", "APPROVED", "SENT"] } } });
    if (has) { skipped++; continue; }
    const need = p.channel === "EMAIL" ? c.email : p.channel === "SMS" ? c.phone : c.linkedinUrl;
    if (!need) { skipped++; await runEvent(run.id, `${c.fullName}: no ${p.channel} contact detail, skipped`, "warn"); continue; }
    try {
      const d = await draftOutreach({ tenant, senderName: p.userName, candidate: c, job, channel: p.channel });
      await prisma.message.create({ data: { tenantId: run.tenantId, candidateId: c.id, channel: p.channel, direction: "OUTBOUND", status: "DRAFT", subject: d.subject, body: d.body, kind: "outreach" } });
      made++;
    } catch (e) {
      skipped++;
      await runEvent(run.id, `${c.fullName}: ${e instanceof DncError ? "do-not-contact" : (e as Error).message}`, "warn");
    }
  }
  return `Drafted ${made} messages (${skipped} skipped). Review and approve them in Outreach.`;
}

export async function runProspecting(run: Run) {
  const p = run.params as { titles: string[]; keywords?: string; domains?: string[]; locations?: string[]; limit?: number; userName: string };
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: run.tenantId } });
  const people = await apolloPeople(run.tenantId, { titles: p.titles, keywords: p.keywords, companyDomains: p.domains, locations: p.locations, limit: p.limit ?? 25 });
  let n = 0;
  for (const x of people) {
    const exists = await prisma.prospect.findFirst({ where: { tenantId: run.tenantId, company: x.company ?? "", contactName: x.fullName } });
    if (exists || !x.company) continue;
    const pr = await prisma.prospect.create({
      data: { tenantId: run.tenantId, company: x.company, domain: x.domain, contactName: x.fullName, contactTitle: x.title, contactEmail: x.email, linkedinUrl: x.linkedinUrl },
    });
    const intro = await draftProspectIntro(tenant, p.userName, pr);
    await prisma.prospect.update({ where: { id: pr.id }, data: { rationale: intro.rationale } });
    if (x.email) {
      // A Contact gives the message a recipient, so the normal approve → send pipeline (DNC, caps) applies.
      const contact = await prisma.contact.create({ data: { tenantId: run.tenantId, fullName: x.fullName, title: x.title, email: x.email, linkedinUrl: x.linkedinUrl, source: "apollo" } });
      await prisma.message.create({ data: { tenantId: run.tenantId, contactId: contact.id, channel: "EMAIL", direction: "OUTBOUND", status: "DRAFT", kind: "outreach", subject: intro.subject, body: intro.body, threadKey: `prospect:${pr.id}` } });
    }
    n++;
  }
  return `Added ${n} prospects with draft intros`;
}
