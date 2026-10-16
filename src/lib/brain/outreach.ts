import type { Candidate, Channel, JobOrder, Tenant } from "@prisma/client";
import { aiConfigured, completeJson } from "./claude";
import { FOLLOWUP_SYSTEM, OUTREACH_SYSTEM } from "./prompts";
import { compLine, enforceVoiceAndComp, isDoNotContact } from "./rules";
import { profileText } from "./scoring";

export class DncError extends Error {}

type Draft = { subject: string | null; body: string; issues: string[]; ok: boolean; engine: "claude" | "template" };

const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;

function template(channel: Channel, c: Candidate, job: JobOrder | null, sender: string, firm: string, comp: string | null): { subject: string | null; body: string } {
  const role = job?.title ?? "a search I'm running";
  const where = job?.location ? ` in ${job.location}` : "";
  const why = c.currentTitle ? `your background as ${c.currentTitle}${c.currentCompany ? ` at ${c.currentCompany}` : ""}` : "your background";
  const compSentence = comp ? ` The range is ${comp}.` : "";
  if (channel === "SMS") {
    return { subject: null, body: `Hi ${first(c.fullName)}, it's ${sender} with ${firm}. I'm recruiting for ${role}${where} and ${why} stood out. Open to a quick chat? Reply STOP to opt out.` };
  }
  if (channel === "LINKEDIN") {
    return {
      subject: `${role}${where}`.slice(0, 60),
      body: `Hi ${first(c.fullName)},\n\nI'm ${sender} at ${firm}. I'm working on ${role}${where} and ${why} stood out.${compSentence}\n\nIf it's of interest, I'd be glad to share the details; if not, no problem at all.\n\n${sender}`,
    };
  }
  return {
    subject: `${role}${where}`.slice(0, 70),
    body: `Hi ${first(c.fullName)},\n\nI'm ${sender} at ${firm}, and I'm running a search for ${role}${where}. ${why[0].toUpperCase()}${why.slice(1)} stood out against what the client is looking for.${compSentence}\n\nWould you be open to a 15 minute call this week to hear more? If the timing is wrong or it's not for you, just say so and I won't follow up.\n\nBest,\n${sender}\n${firm}`,
  };
}

export async function draftOutreach(opts: {
  tenant: Tenant; senderName: string; candidate: Candidate; job: JobOrder | null; channel: Channel; followupOf?: { body: string };
}): Promise<Draft> {
  const { tenant, senderName, candidate: c, job, channel } = opts;
  if (await isDoNotContact(tenant.id, c)) throw new DncError("Candidate is on the do-not-contact list");
  const firm = tenant.brandName ?? tenant.name;
  const comp = job ? compLine(job) : null;

  let raw: { subject: string | null; body: string } | null = null;
  let engine: Draft["engine"] = "template";
  if (aiConfigured()) {
    try {
      raw = await completeJson<{ subject: string | null; body: string }>({
        tenantId: tenant.id,
        feature: opts.followupOf ? "followup" : "outreach",
        system: opts.followupOf ? FOLLOWUP_SYSTEM : OUTREACH_SYSTEM,
        user: [
          `CHANNEL: ${channel}`,
          `SENDER: ${senderName}, ${firm}`,
          `ROLE: ${job ? `${job.title}${job.location ? `, ${job.location}` : ""}\n${(job.description ?? "").slice(0, 1500)}` : "n/a"}`,
          `COMPENSATION DISCLOSURE: ${comp ? `ALLOWED. Range: ${comp}` : "NOT ALLOWED. Do not mention pay in any form."}`,
          `CANDIDATE PROFILE:\n${profileText(c).slice(0, 5000)}`,
          opts.followupOf ? `EARLIER MESSAGE:\n${opts.followupOf.body}` : "",
        ].join("\n\n"),
        maxTokens: 700,
      });
      engine = "claude";
    } catch (e) {
      console.warn("[outreach] AI failed, using template:", (e as Error).message);
    }
  }
  raw ??= template(channel, c, job, senderName, firm, comp);
  let out = enforceVoiceAndComp(raw, channel, job);
  if (!out.ok && engine === "claude") {
    // One safe retry path: fall back to the deterministic template rather than ship a rule violation.
    out = enforceVoiceAndComp(template(channel, c, job, senderName, firm, comp), channel, job);
    engine = "template";
  }
  return { ...out, engine };
}
