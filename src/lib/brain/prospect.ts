import type { Prospect, Tenant } from "@prisma/client";
import { aiConfigured, completeJson } from "./claude";
import { PROSPECT_SYSTEM } from "./prompts";
import { enforceVoiceAndComp } from "./rules";

/** Client acquisition: rationale + intro email for a prospect company/contact. */
export async function draftProspectIntro(tenant: Tenant, senderName: string, p: Prospect) {
  const firm = tenant.brandName ?? tenant.name;
  let raw: { rationale: string; subject: string; body: string } | null = null;
  if (aiConfigured()) {
    try {
      raw = await completeJson({
        tenantId: tenant.id,
        feature: "prospect",
        system: PROSPECT_SYSTEM,
        user: `FIRM: ${firm}\nSENDER: ${senderName}\nCOMPANY: ${p.company} ${p.domain ?? ""}\nCONTACT: ${p.contactName ?? "unknown"}, ${p.contactTitle ?? ""}\nNOTES: ${p.rationale ?? ""}`,
        maxTokens: 600,
      });
    } catch (e) {
      console.warn("[prospect] AI failed:", (e as Error).message);
    }
  }
  raw ??= {
    rationale: p.rationale ?? `${p.company} matches the target profile for ${firm}.`,
    subject: `Hiring help at ${p.company}`,
    body: `Hi ${(p.contactName ?? "there").split(" ")[0]},\n\nI'm ${senderName} at ${firm}. We help companies like ${p.company} fill senior roles quickly with vetted candidates.\n\nIf you have a search open or coming up, I'd be glad to share how we'd approach it. If not, no worries.\n\nBest,\n${senderName}`,
  };
  const out = enforceVoiceAndComp({ subject: raw.subject, body: raw.body }, "EMAIL", { discloseComp: false });
  return { rationale: raw.rationale, subject: out.subject ?? raw.subject, body: out.body };
}
