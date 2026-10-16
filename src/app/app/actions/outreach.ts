"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Channel } from "@prisma/client";
import { requireCtx } from "@/lib/auth";
import { DncError, draftOutreach } from "@/lib/brain/outreach";
import { enforceVoiceAndComp, isDoNotContact } from "@/lib/brain/rules";
import { enqueueRun } from "@/lib/services/runs";
import { audit } from "@/lib/audit";

const CHANNELS = ["EMAIL", "SMS", "LINKEDIN"] as const;
const asChannel = (c: string): Channel => {
  if (!CHANNELS.includes(c as any)) throw new Error("Invalid channel");
  return c as Channel;
};

export async function draftMessage(candidateId: string, channelRaw: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const channel = asChannel(channelRaw);
  const c = await ctx.db.candidate.findFirst({ where: { id: candidateId }, include: { jobOrder: true } });
  if (!c) throw new Error("Candidate not found");
  const need = channel === "EMAIL" ? c.email : channel === "SMS" ? c.phone : c.linkedinUrl;
  if (!need) redirect(`/app/candidates/${candidateId}?error=${encodeURIComponent(`No ${channel.toLowerCase()} contact detail on file`)}`);
  try {
    const d = await draftOutreach({ tenant: ctx.tenant, senderName: ctx.user.name, candidate: c, job: c.jobOrder, channel });
    const m = await ctx.db.message.create({
      data: { tenantId: ctx.tenant.id, candidateId, channel, direction: "OUTBOUND", status: "DRAFT", subject: d.subject, body: d.body, kind: "outreach" },
    });
    redirect(`/app/outreach?focus=${m.id}`);
  } catch (e) {
    if (e instanceof DncError) redirect(`/app/candidates/${candidateId}?error=${encodeURIComponent("Candidate is on the do-not-contact list")}`);
    throw e;
  }
}

export async function bulkDraft(f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const jobOrderId = String(f.get("jobOrderId") ?? "");
  if (!jobOrderId) throw new Error("Choose a role");
  const run = await enqueueRun(ctx.tenant.id, "OUTREACH_DRAFT", {
    jobOrderId, channel: asChannel(String(f.get("channel") ?? "EMAIL")), minScore: Number(f.get("minScore") ?? 60), limit: Math.min(Number(f.get("limit") ?? 20), 50), userName: ctx.user.name,
  }, { userId: ctx.user.id });
  redirect(`/app/runs/${run.id}`);
}

export async function updateDraft(id: string, f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  const m = await ctx.db.message.findFirst({ where: { id }, include: { candidate: { include: { jobOrder: true } } } });
  if (!m || m.status !== "DRAFT") throw new Error("Only drafts can be edited");
  const out = enforceVoiceAndComp({ subject: (f.get("subject") as string) || null, body: String(f.get("body") ?? "") }, m.channel, m.candidate?.jobOrder);
  if (!out.ok) redirect(`/app/outreach?focus=${id}&error=${encodeURIComponent(out.issues.join("; "))}`);
  await ctx.db.message.update({ where: { id }, data: { subject: out.subject, body: out.body } });
  revalidatePath("/app/outreach");
}

/** THE approval gate: DRAFT → APPROVED is a human action by a recruiter; the worker only sends APPROVED messages. */
export async function approveAndSend(id: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const m = await ctx.db.message.findFirst({ where: { id }, include: { candidate: true, contact: true } });
  if (!m || (m.status !== "DRAFT" && m.status !== "FAILED")) throw new Error("Message is not awaiting approval");
  const to = m.candidate ?? m.contact;
  if (to && (await isDoNotContact(ctx.tenant.id, { email: to.email, phone: to.phone, linkedinUrl: to.linkedinUrl }))) {
    redirect(`/app/outreach?focus=${id}&error=${encodeURIComponent("Recipient is on the do-not-contact list")}`);
  }
  await ctx.db.message.update({ where: { id }, data: { status: "APPROVED", approvedById: ctx.user.id, approvedAt: new Date(), error: null } });
  await enqueueRun(ctx.tenant.id, "SEND_MESSAGE", { messageId: id }, { userId: ctx.user.id });
  await audit("message.approved", { tenantId: ctx.tenant.id, userId: ctx.user.id, detail: id });
  revalidatePath("/app/outreach");
}

export async function discardDraft(id: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await ctx.db.message.deleteMany({ where: { id, status: "DRAFT" } });
  revalidatePath("/app/outreach");
}

export async function draftFollowup(messageId: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const prev = await ctx.db.message.findFirst({ where: { id: messageId }, include: { candidate: { include: { jobOrder: true } } } });
  if (!prev?.candidate || prev.status !== "SENT") throw new Error("Follow-ups go on sent messages");
  const d = await draftOutreach({ tenant: ctx.tenant, senderName: ctx.user.name, candidate: prev.candidate, job: prev.candidate.jobOrder, channel: prev.channel, followupOf: { body: prev.body } });
  const m = await ctx.db.message.create({
    data: { tenantId: ctx.tenant.id, candidateId: prev.candidateId, channel: prev.channel, direction: "OUTBOUND", status: "DRAFT", kind: "followup", subject: prev.channel === "EMAIL" ? `Re: ${prev.subject ?? ""}`.slice(0, 190) : d.subject, body: d.body, threadKey: prev.threadKey, followupOfId: prev.id },
  });
  redirect(`/app/outreach?focus=${m.id}`);
}

export async function runInboxNow() {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const run = await enqueueRun(ctx.tenant.id, "INBOX_WATCH", {}, { userId: ctx.user.id });
  redirect(`/app/runs/${run.id}`);
}
