import type { Candidate, JobOrder } from "@prisma/client";
import { aiConfigured, complete } from "./claude";
import { BRIEF_SYSTEM } from "./prompts";
import { jobText, profileText } from "./scoring";

export async function generateBrief(tenantId: string, job: JobOrder | null, c: Candidate): Promise<string> {
  if (aiConfigured()) {
    try {
      return await complete({
        tenantId,
        feature: "brief",
        system: BRIEF_SYSTEM,
        user: `ROLE\n${job ? jobText(job) : "No specific role selected."}\n\nCANDIDATE\n${profileText(c).slice(0, 12000)}\n\nFit score: ${c.fitScore ?? "n/a"}\nScorer notes: ${c.scoreRationale ?? ""}`,
        maxTokens: 1400,
      });
    } catch (e) {
      console.warn("[brief] AI failed, using template:", (e as Error).message);
    }
  }
  const gaps = ((c.scoreBreakdown as any)?.gaps as string[] | undefined) ?? [];
  return [
    `## Snapshot`,
    `${c.fullName}, ${c.currentTitle ?? c.headline ?? "title n/a"}${c.currentCompany ? ` at ${c.currentCompany}` : ""}${c.location ? ` (${c.location})` : ""}.`,
    `Fit score: ${c.fitScore ?? "not scored"}${job ? ` for ${job.title}` : ""}.`,
    ``,
    `## Why they fit`,
    c.scoreRationale ?? "Not yet scored.",
    ``,
    `## Gaps and risks`,
    gaps.length ? gaps.map((g) => `- No clear evidence of: ${g}`).join("\n") : "- None flagged by the automated scorer. Verify in screening.",
    ``,
    `## Career trajectory`,
    c.summary ?? c.headline ?? "Profile summary not captured.",
    ``,
    `## Questions to probe in interview`,
    `- Walk me through the scope you own today (team, budget, systems).`,
    `- What would you change in your current function if you had a free hand?`,
    `- Why now? What would make a move worthwhile?`,
    `- Which of the role's must-haves are strongest/weakest for you, honestly?`,
    ``,
    `## Recommendation`,
    (c.fitScore ?? 0) >= 75 ? "Advance: strong evidence against the brief." : (c.fitScore ?? 0) >= 55 ? "Hold: promising, needs screening to close gaps." : "Pass unless new information emerges.",
    `\n_Template brief generated without AI. Enable the platform AI key for a full deep-dive._`,
  ].join("\n");
}
