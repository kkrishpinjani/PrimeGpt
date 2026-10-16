import { prisma } from "../db";
import type { Channel, JobOrder } from "@prisma/client";

/** Business rules that must survive the port: voice, comp-disclosure, DNC, approval gate. */

const BANNED = [
  /\brockstar\b/i,
  /\bninja\b/i,
  /\bamazing opportunity\b/i,
  /\bexciting opportunity\b/i,
  /\bgame[- ]chang/i,
];

export function limitsFor(channel: Channel) {
  return channel === "SMS"
    ? { body: 320, subject: 0 }
    : channel === "LINKEDIN"
      ? { body: 1900, subject: 60 }
      : { body: 4000, subject: 70 };
}

export function compMentioned(text: string) {
  return /(\$|USD|€|£)\s?\d|\b\d{2,3}\s?[kK]\b|\bcompensation\b|\bsalary\b|\bbase pay\b/.test(text);
}

/** Post-generation guard. Returns cleaned message + violations. `ok` is false on hard violations. */
export function enforceVoiceAndComp(
  msg: { subject: string | null; body: string },
  channel: Channel,
  job?: Pick<JobOrder, "discloseComp"> | null,
) {
  const issues: string[] = [];
  let body = msg.body.replace(/—/g, ", ").replace(/[ \t]+\n/g, "\n").trim();
  let subject = msg.subject ? msg.subject.replace(/—/g, "-").trim() : null;
  for (const b of BANNED) {
    if (b.test(body) || (subject && b.test(subject))) issues.push(`banned phrase: ${b}`);
  }
  if (!job?.discloseComp && compMentioned(body + " " + (subject ?? ""))) {
    issues.push("compensation mentioned but disclosure is not allowed for this role");
  }
  const lim = limitsFor(channel);
  if (channel === "SMS") {
    subject = null;
    if (!/stop/i.test(body)) {
      const room = lim.body - " Reply STOP to opt out.".length;
      body = (body.length > room ? body.slice(0, room) : body) + " Reply STOP to opt out.";
    }
  }
  if (body.length > lim.body) {
    body = body.slice(0, lim.body - 1).trimEnd() + "…";
    issues.push("body truncated to channel limit");
  }
  if (subject && lim.subject && subject.length > lim.subject) {
    subject = subject.slice(0, lim.subject).trimEnd();
    issues.push("subject truncated");
  }
  const hard = issues.filter((i) => i.startsWith("compensation") || i.startsWith("banned"));
  return { subject, body, issues, ok: hard.length === 0 };
}

export function compLine(job: Pick<JobOrder, "discloseComp" | "compMin" | "compMax" | "compCurrency">) {
  if (!job.discloseComp || (!job.compMin && !job.compMax)) return null;
  const f = (n: number) => `${job.compCurrency} ${n.toLocaleString("en-US")}`;
  return job.compMin && job.compMax ? `${f(job.compMin)} to ${f(job.compMax)}` : f((job.compMin ?? job.compMax)!);
}

export const normPhone = (p: string) => {
  const d = p.replace(/[^\d+]/g, "");
  return d.startsWith("+") ? d : d.length === 10 ? `+1${d}` : `+${d}`;
};

/** Do-not-contact holds. Checked at draft time AND again at send time. */
export async function isDoNotContact(
  tenantId: string,
  c: { email?: string | null; phone?: string | null; linkedinUrl?: string | null },
) {
  const or: any[] = [];
  if (c.email) or.push({ email: c.email.toLowerCase() });
  if (c.phone) or.push({ phone: normPhone(c.phone) });
  if (c.linkedinUrl) or.push({ linkedinUrl: c.linkedinUrl });
  if (!or.length) return false;
  return !!(await prisma.doNotContact.findFirst({ where: { tenantId, OR: or } }));
}

/** Constant on purpose: autonomy never skips the approval gate for outreach. */
export const APPROVAL_REQUIRED = true;
