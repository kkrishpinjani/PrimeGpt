import type { Candidate, JobOrder } from "@prisma/client";
import { aiConfigured, completeJson } from "./claude";
import { SCORING_SYSTEM, SCORE_WEIGHTS } from "./prompts";

export type ScoreResult = {
  score: number;
  breakdown: Record<keyof typeof SCORE_WEIGHTS, number>;
  rationale: string;
  gaps: string[];
  engine: "claude" | "heuristic";
};

const lines = (s?: string | null) => (s ?? "").split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "has", "have", "from", "are", "was", "any", "all", "into", "such",
  "company", "companies", "experience", "experienced", "years", "year", "strong", "proven", "track", "record", "ability",
  "background", "knowledge", "working", "work", "plus", "preferred", "required", "demonstrated", "level", "senior", "team",
]);
/** Prefix stemmer so "implementation" matches "implemented" and "integration" matches "integrated". */
const stem = (w: string) => (w.length > 6 ? w.slice(0, 6) : w.replace(/s$/, ""));
/** Hyphens/slashes split ("PE-backed" → pe, backed; "S/4HANA" → 4hana); "&" is kept so "M&A" survives. */
export const tokens = (s: string) =>
  s.toLowerCase().replace(/[-/_]/g, " ").split(/[^a-z0-9&+#]+/)
    .map((w) => w.replace(/^&+|&+$/g, ""))
    .filter((w) => (w.length > 2 || w.includes("&") || w === "pe" || /\d/.test(w)) && !STOP.has(w))
    .map(stem);

export function profileText(c: Partial<Candidate>) {
  return [c.fullName, c.headline, c.currentTitle, c.currentCompany, c.location, c.summary, c.skills, c.rawProfile]
    .filter(Boolean)
    .join("\n");
}

export function jobText(j: Partial<JobOrder>) {
  return [`Title: ${j.title}`, j.location && `Location: ${j.location}`, j.description, j.mustHaves && `Must have:\n${j.mustHaves}`, j.niceToHaves && `Nice to have:\n${j.niceToHaves}`]
    .filter(Boolean)
    .join("\n");
}

/** Deterministic fallback so the product works (and is testable) without an AI key. */
export function heuristicScore(job: JobOrder, c: Candidate): ScoreResult {
  const hay = profileText(c).toLowerCase();
  const hayTokens = new Set(tokens(hay));
  const must = lines(job.mustHaves);
  const nice = lines(job.niceToHaves);
  const hit = (req: string) => {
    const t = tokens(req);
    if (!t.length) return 0;
    // 60% of a requirement's distinctive terms counts as full evidence
    return Math.min(1, t.filter((w) => hayTokens.has(w)).length / t.length / 0.6);
  };
  const mustScores = must.map(hit);
  const mustPct = must.length ? (mustScores.reduce((a, b) => a + b, 0) / must.length) * 100 : 50;
  const nicePct = nice.length ? (nice.map(hit).reduce((a, b) => a + b, 0) / nice.length) * 100 : 50;
  const titleHit = hit(job.title);
  const senior = /\b(vp|vice president|chief|cxo|ceo|cfo|coo|cto|cmo|head|director|svp|evp|president|principal|lead)\b/i;
  const wantsSenior = senior.test(job.title);
  const seniority = senior.test(`${c.currentTitle ?? ""} ${c.headline ?? ""}`) ? (wantsSenior ? 85 : 70) : wantsSenior ? 30 : 60;
  const loc = job.location
    ? tokens(job.location).some((w) => tokens(c.location ?? "").includes(w)) ? 90 : /remote/i.test(job.location) ? 80 : 35
    : 70;
  const breakdown = {
    must_haves: clamp(mustPct * 0.9 + titleHit * 10),
    seniority_and_scope: clamp(seniority),
    industry_relevance: clamp(nicePct * 0.7 + titleHit * 30),
    stability_and_trajectory: 60,
    location_fit: clamp(loc),
  };
  const score = clamp(Object.entries(SCORE_WEIGHTS).reduce((s, [k, w]) => s + breakdown[k as keyof typeof breakdown] * w, 0));
  const gaps = must.filter((m, i) => mustScores[i] < 0.5).slice(0, 5);
  return {
    score,
    breakdown,
    gaps,
    engine: "heuristic",
    rationale: `Keyword evidence covers ${Math.round(mustPct)}% of must-haves${gaps.length ? `; no clear evidence for: ${gaps.join("; ")}` : ""}. Title/seniority signal ${seniority}/100, location ${breakdown.location_fit}/100. (Heuristic score; run with AI enabled for a full read.)`,
  };
}

export async function scoreCandidate(tenantId: string, job: JobOrder, c: Candidate): Promise<ScoreResult> {
  if (!aiConfigured()) return heuristicScore(job, c);
  try {
    const r = await completeJson<Omit<ScoreResult, "engine">>({
      tenantId,
      feature: "score",
      system: SCORING_SYSTEM,
      user: `ROLE\n${jobText(job)}\n\nCANDIDATE\n${profileText(c).slice(0, 9000)}`,
      maxTokens: 700,
    });
    // Recompute the weighted score ourselves so the model cannot drift from the published weights.
    const b = r.breakdown;
    const score = clamp(Object.entries(SCORE_WEIGHTS).reduce((s, [k, w]) => s + clamp(Number((b as any)[k] ?? 0)) * w, 0));
    return { ...r, score, engine: "claude", gaps: r.gaps ?? [] };
  } catch (e) {
    console.warn("[scoring] AI failed, using heuristic:", (e as Error).message);
    return heuristicScore(job, c);
  }
}
