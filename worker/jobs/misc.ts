import type { Run } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateBrief } from "@/lib/brain/brief";
import { DncError, draftOutreach } from "@/lib/brain/outreach";
import { draftProspectIntro } from "@/lib/brain/prospect";
import { apolloPeople, exaSearch } from "@/lib/integrations/data-sources";
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

type ProspectParams = {
  mode?: "people" | "companies" | "enrich";
  titles?: string[]; keywords?: string; domains?: string[]; locations?: string[]; limit?: number; query?: string; prospectId?: string; userName: string;
};
const DEFAULT_BUYER_TITLES = ["Chief People Officer", "VP Human Resources", "Head of Talent Acquisition", "Chief Executive Officer", "President"];
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return undefined; } };
const companyFromTitle = (t: string, host?: string) => (t.split(/\s[-|:–—]\s/)[0] || host || "").trim().slice(0, 190);

/** Client acquisition (scope §3.2): find people (Apollo), find companies (web search), then enrich companies with a decision maker. */
export async function runProspecting(run: Run) {
  const p = run.params as ProspectParams;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: run.tenantId } });
  const mode = p.mode ?? "people";

  const addContactAndDraft = async (pr: { id: string; company: string; domain: string | null; contactName: string | null; contactTitle: string | null; contactEmail: string | null; linkedinUrl: string | null; rationale: string | null }) => {
    const intro = await draftProspectIntro(tenant, p.userName, pr as any);
    await prisma.prospect.update({ where: { id: pr.id }, data: { rationale: pr.rationale ?? intro.rationale } });
    if (!pr.contactEmail) return;
    // A Contact gives the message a recipient, so the normal approve → send pipeline (DNC, caps) applies.
    const existing = await prisma.contact.findFirst({ where: { tenantId: run.tenantId, email: pr.contactEmail } });
    const contact = existing ?? (await prisma.contact.create({ data: { tenantId: run.tenantId, fullName: pr.contactName ?? "Unknown", title: pr.contactTitle, email: pr.contactEmail, linkedinUrl: pr.linkedinUrl, source: "apollo" } }));
    await prisma.message.create({ data: { tenantId: run.tenantId, contactId: contact.id, channel: "EMAIL", direction: "OUTBOUND", status: "DRAFT", kind: "outreach", subject: intro.subject, body: intro.body, threadKey: `prospect:${pr.id}` } });
  };

  if (mode === "companies") {
    const q = p.query?.trim() || `${p.keywords ?? ""} companies ${(p.locations ?? []).join(" ")} hiring leadership roles`.trim();
    const results = await exaSearch(run.tenantId, q, Math.min(p.limit ?? 20, 50));
    let n = 0;
    for (const r of results) {
      const domain = hostOf(r.url);
      const company = companyFromTitle(r.title, domain);
      if (!company || !domain) continue;
      if (await prisma.prospect.findFirst({ where: { tenantId: run.tenantId, OR: [{ domain }, { company }] } })) continue;
      await prisma.prospect.create({ data: { tenantId: run.tenantId, company, domain, rationale: r.text.replace(/\s+/g, " ").slice(0, 280) || null } });
      n++;
    }
    return `Found ${n} new companies from web search. Use "Find contact" on each to enrich it with a decision maker.`;
  }

  if (mode === "enrich") {
    const pr = await prisma.prospect.findFirst({ where: { id: p.prospectId, tenantId: run.tenantId } });
    if (!pr) throw new Error("Prospect not found");
    if (!pr.domain) throw new Error("Prospect has no domain to search");
    const people = await apolloPeople(run.tenantId, { titles: p.titles?.length ? p.titles : DEFAULT_BUYER_TITLES, companyDomains: [pr.domain], limit: 3 });
    const best = people.find((x) => x.email) ?? people[0];
    if (!best) return `No decision maker found at ${pr.company}.`;
    const updated = await prisma.prospect.update({
      where: { id: pr.id },
      data: { contactName: best.fullName, contactTitle: best.title, contactEmail: best.email, linkedinUrl: best.linkedinUrl },
    });
    await addContactAndDraft(updated);
    return `Enriched ${pr.company}: ${best.fullName}${best.title ? `, ${best.title}` : ""}${best.email ? " (intro draft ready in Outreach)" : " (no email available)"}.`;
  }

  const people = await apolloPeople(run.tenantId, { titles: p.titles ?? [], keywords: p.keywords, companyDomains: p.domains, locations: p.locations, limit: p.limit ?? 25 });
  let n = 0;
  for (const x of people) {
    if (!x.company) continue;
    if (await prisma.prospect.findFirst({ where: { tenantId: run.tenantId, company: x.company, contactName: x.fullName } })) continue;
    const pr = await prisma.prospect.create({
      data: { tenantId: run.tenantId, company: x.company, domain: x.domain, contactName: x.fullName, contactTitle: x.title, contactEmail: x.email, linkedinUrl: x.linkedinUrl },
    });
    await addContactAndDraft(pr);
    n++;
  }
  return `Added ${n} prospects with draft intros`;
}
