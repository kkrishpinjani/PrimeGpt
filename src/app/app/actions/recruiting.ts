"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { enqueueRun } from "@/lib/services/runs";
import { scoreAndSave, upsertCandidate } from "@/lib/services/candidates";
import { normPhone } from "@/lib/brain/rules";
import { createMeetEvent } from "@/lib/integrations/google";
import { getSecret } from "@/lib/integrations/store";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};
const num = (f: FormData, k: string) => {
  const v = s(f, k);
  return v && !Number.isNaN(Number(v)) ? Math.round(Number(v)) : undefined;
};

// ───── clients & job orders ─────
export async function createClient(f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  const name = z.string().min(1).max(190).parse(s(f, "name"));
  const c = await ctx.db.client.create({ data: { tenantId: ctx.tenant.id, name, industry: s(f, "industry"), website: s(f, "website"), notes: s(f, "notes") } });
  revalidatePath("/app/clients");
  redirect(`/app/clients?created=${c.id}`);
}

export async function createJobOrder(f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  const title = z.string().min(1).max(190).parse(s(f, "title"));
  const j = await ctx.db.jobOrder.create({
    data: {
      tenantId: ctx.tenant.id, title, clientId: s(f, "clientId"), location: s(f, "location"), description: s(f, "description"),
      mustHaves: s(f, "mustHaves"), niceToHaves: s(f, "niceToHaves"), compMin: num(f, "compMin"), compMax: num(f, "compMax"),
      discloseComp: f.get("discloseComp") === "on",
    },
  });
  revalidatePath("/app/jobs");
  redirect(`/app/jobs/${j.id}`);
}

export async function updateJobOrder(id: string, f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await ctx.db.jobOrder.update({
    where: { id },
    data: {
      title: s(f, "title"), location: s(f, "location") ?? null, description: s(f, "description") ?? null, mustHaves: s(f, "mustHaves") ?? null,
      niceToHaves: s(f, "niceToHaves") ?? null, compMin: num(f, "compMin") ?? null, compMax: num(f, "compMax") ?? null,
      discloseComp: f.get("discloseComp") === "on", status: s(f, "status"),
    },
  });
  revalidatePath(`/app/jobs/${id}`);
}

// ───── searches & runs ─────
export async function createSearch(f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const sources = f.getAll("sources").map(String).filter(Boolean);
  const search = await ctx.db.savedSearch.create({
    data: {
      tenantId: ctx.tenant.id, name: s(f, "name") ?? "Untitled search", jobOrderId: s(f, "jobOrderId"), keywords: s(f, "keywords"), titles: s(f, "titles"),
      locations: s(f, "locations"), excludes: s(f, "excludes"), sources: (sources.length ? sources : ["linkedin_recruiter"]).join(","),
      maxResults: Math.min(num(f, "maxResults") ?? 25, 100),
    },
  });
  const run = await enqueueRun(ctx.tenant.id, "SOURCING", {}, { searchId: search.id, userId: ctx.user.id });
  redirect(`/app/runs/${run.id}`);
}

export async function rerunSearch(searchId: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const search = await ctx.db.savedSearch.findFirst({ where: { id: searchId } });
  if (!search) throw new Error("Search not found");
  const run = await enqueueRun(ctx.tenant.id, "SOURCING", {}, { searchId, userId: ctx.user.id });
  redirect(`/app/runs/${run.id}`);
}

export async function cancelRun(runId: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await ctx.db.run.updateMany({ where: { id: runId, status: { in: ["QUEUED", "NEEDS_HUMAN"] } }, data: { status: "CANCELED", finishedAt: new Date() } });
  revalidatePath(`/app/runs/${runId}`);
}

// ───── candidates ─────
export async function setCandidateStatus(id: string, status: "NEW" | "SAVED" | "REJECTED" | "CONTACTED" | "REPLIED" | "INTERVIEWING" | "PLACED") {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await ctx.db.candidate.update({ where: { id }, data: { status, stage: status.toLowerCase() } });
  revalidatePath("/app/candidates");
  revalidatePath(`/app/candidates/${id}`);
  revalidatePath("/app/pipeline");
}

export async function saveCandidateNotes(id: string, f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await ctx.db.candidate.update({ where: { id }, data: { notes: s(f, "notes") ?? null } });
  revalidatePath(`/app/candidates/${id}`);
}

export async function requestBrief(id: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  await enqueueRun(ctx.tenant.id, "BRIEF", { candidateId: id }, { userId: ctx.user.id });
  revalidatePath(`/app/candidates/${id}`);
}

export async function rescoreJob(jobOrderId: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const run = await enqueueRun(ctx.tenant.id, "SCORING", { jobOrderId }, { userId: ctx.user.id });
  redirect(`/app/runs/${run.id}`);
}

export async function addCandidate(f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  const fullName = z.string().min(1).parse(s(f, "fullName"));
  const jobOrderId = s(f, "jobOrderId");
  const [c] = await upsertCandidate(ctx.tenant.id, {
    fullName, source: "manual", headline: s(f, "headline"), currentTitle: s(f, "currentTitle"), currentCompany: s(f, "currentCompany"),
    location: s(f, "location"), email: s(f, "email"), phone: s(f, "phone") ? normPhone(s(f, "phone")!) : undefined, linkedinUrl: s(f, "linkedinUrl"),
    summary: s(f, "summary"), skills: s(f, "skills"), rawProfile: s(f, "rawProfile"), sourceRef: `manual:${Date.now()}`,
  }, { jobOrderId });
  if (jobOrderId) {
    const job = await ctx.db.jobOrder.findFirst({ where: { id: jobOrderId } });
    if (job) await scoreAndSave(ctx.tenant.id, job, c);
  }
  redirect(`/app/candidates/${c.id}`);
}

/** CSV import: also the path for one-time migration of a legacy database export. */
export async function importCsv(f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV file");
  if (file.size > 10 * 1024 * 1024) throw new Error("CSV too large (10 MB max)");
  const rows: Record<string, string>[] = parse(await file.text(), { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase().replace(/\s+/g, "_")), skip_empty_lines: true, relax_column_count: true, bom: true });
  const jobOrderId = s(f, "jobOrderId");
  const job = jobOrderId ? await ctx.db.jobOrder.findFirst({ where: { id: jobOrderId } }) : null;
  const pick = (r: Record<string, string>, ...k: string[]) => k.map((x) => r[x]).find((v) => v && v.trim())?.trim();
  let made = 0, updated = 0;
  for (const r of rows.slice(0, 5000)) {
    const name = pick(r, "full_name", "name") ?? [pick(r, "first_name"), pick(r, "last_name")].filter(Boolean).join(" ");
    if (!name) continue;
    const [c, isNew] = await upsertCandidate(ctx.tenant.id, {
      fullName: name, source: "csv", headline: pick(r, "headline"), currentTitle: pick(r, "title", "current_title", "job_title"), currentCompany: pick(r, "company", "current_company"),
      location: pick(r, "location", "city"), email: pick(r, "email"), phone: pick(r, "phone", "mobile"), linkedinUrl: pick(r, "linkedin", "linkedin_url"),
      summary: pick(r, "summary", "notes"), skills: pick(r, "skills"),
    }, { jobOrderId });
    isNew ? made++ : updated++;
    if (job && isNew) await scoreAndSave(ctx.tenant.id, job, c);
  }
  revalidatePath("/app/candidates");
  redirect(`/app/candidates?imported=${made}&updated=${updated}`);
}

// ───── interviews (Google Calendar + Meet) ─────
export async function scheduleInterview(candidateId: string, f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const c = await ctx.db.candidate.findFirst({ where: { id: candidateId } });
  if (!c) throw new Error("Candidate not found");
  const start = new Date(z.string().min(1).parse(s(f, "startsAt")));
  const mins = num(f, "minutes") ?? 30;
  const end = new Date(start.getTime() + mins * 60_000);
  const attendees = [c.email, ...(s(f, "attendees")?.split(/[,\s]+/) ?? [])].filter(Boolean) as string[];
  let meetLink: string | null = null, eventId: string | undefined;
  if (await getSecret(ctx.tenant.id, "gcalendar")) {
    const r = await createMeetEvent(ctx.tenant.id, { summary: `Interview: ${c.fullName}`, description: s(f, "notes"), start, end, attendees });
    meetLink = r.meetLink; eventId = r.eventId;
  }
  await ctx.db.interview.create({
    data: { tenantId: ctx.tenant.id, candidateId, jobOrderId: c.jobOrderId, startsAt: start, endsAt: end, meetLink, calendarEventId: eventId, attendeeEmails: attendees.join(","), notes: s(f, "notes") },
  });
  await ctx.db.candidate.update({ where: { id: candidateId }, data: { status: "INTERVIEWING", stage: "interviewing" } });
  revalidatePath(`/app/candidates/${candidateId}`);
  revalidatePath("/app/interviews");
}

// ───── do-not-contact ─────
export async function addDnc(f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  const email = s(f, "email")?.toLowerCase(), phone = s(f, "phone"), linkedinUrl = s(f, "linkedinUrl");
  if (!email && !phone && !linkedinUrl) throw new Error("Provide an email, phone or LinkedIn URL");
  await ctx.db.doNotContact.create({ data: { tenantId: ctx.tenant.id, email, phone: phone ? normPhone(phone) : undefined, linkedinUrl, reason: s(f, "reason") } });
  revalidatePath("/app/settings");
}
export async function removeDnc(id: string) {
  const ctx = await requireCtx({ minRole: "ADMIN" });
  await ctx.db.doNotContact.deleteMany({ where: { id } });
  revalidatePath("/app/settings");
}

// ───── client acquisition ─────
export async function runProspecting(f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const list = (k: string) => (s(f, k) ?? "").split(/[\n,;]/).map((x) => x.trim()).filter(Boolean);
  const run = await enqueueRun(ctx.tenant.id, "PROSPECTING", { titles: list("titles"), keywords: s(f, "keywords") ?? "", domains: list("domains"), locations: list("locations"), limit: num(f, "limit") ?? 25, userName: ctx.user.name }, { userId: ctx.user.id });
  redirect(`/app/runs/${run.id}`);
}
export async function setProspectStatus(id: string, status: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await ctx.db.prospect.updateMany({ where: { id }, data: { status } });
  revalidatePath("/app/prospects");
}
