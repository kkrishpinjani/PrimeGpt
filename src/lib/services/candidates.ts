import type { Candidate, JobOrder, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { scoreCandidate } from "../brain/scoring";

export type CandidateInput = {
  fullName: string;
  source: string;
  sourceRef?: string | null;
  headline?: string; currentTitle?: string; currentCompany?: string; location?: string;
  email?: string; phone?: string; linkedinUrl?: string; summary?: string; skills?: string; rawProfile?: string;
};

const trim = (s: string | undefined, n: number) => (s ? s.slice(0, n) : undefined);

/** Upsert by (tenant, source, sourceRef) so re-running a search never duplicates people. Returns [row, isNew]. */
export async function upsertCandidate(tenantId: string, input: CandidateInput, ctx: { runId?: string; jobOrderId?: string | null } = {}): Promise<[Candidate, boolean]> {
  const ref = input.sourceRef ?? input.linkedinUrl ?? (input.email ? `email:${input.email.toLowerCase()}` : `name:${input.fullName.toLowerCase()}|${(input.currentCompany ?? "").toLowerCase()}`);
  const data: Prisma.CandidateUncheckedCreateInput = {
    tenantId, source: input.source, sourceRef: ref.slice(0, 190),
    fullName: input.fullName.slice(0, 190),
    headline: trim(input.headline, 250), currentTitle: trim(input.currentTitle, 190), currentCompany: trim(input.currentCompany, 190),
    location: trim(input.location, 190), email: input.email?.toLowerCase().slice(0, 190), phone: trim(input.phone, 60),
    linkedinUrl: trim(input.linkedinUrl, 500), summary: input.summary, skills: input.skills, rawProfile: input.rawProfile,
    runId: ctx.runId, jobOrderId: ctx.jobOrderId ?? undefined,
  };
  const existing = await prisma.candidate.findUnique({ where: { tenantId_source_sourceRef: { tenantId, source: input.source, sourceRef: ref.slice(0, 190) } } });
  if (existing) {
    const { tenantId: _t, source: _s, sourceRef: _r, runId, jobOrderId, ...refresh } = data;
    const row = await prisma.candidate.update({ where: { id: existing.id }, data: { ...stripUndef(refresh), jobOrderId: existing.jobOrderId ?? jobOrderId } });
    return [row, false];
  }
  return [await prisma.candidate.create({ data }), true];
}

function stripUndef<T extends Record<string, any>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export async function scoreAndSave(tenantId: string, job: JobOrder, c: Candidate) {
  const r = await scoreCandidate(tenantId, job, c);
  return prisma.candidate.update({
    where: { id: c.id },
    data: { fitScore: r.score, scoreRationale: r.rationale, scoreBreakdown: { ...r.breakdown, gaps: r.gaps, engine: r.engine } },
  });
}

/** Full-text shortlist search (ports the SQLite FTS search). Always tenant-scoped. */
export async function searchCandidates(tenantId: string, query: string, limit = 50): Promise<Array<Candidate & { relevance: number }>> {
  const q = query.trim();
  if (!q) return [];
  // Boolean mode, each term must prefix-match; strip operators from user text to avoid syntax errors.
  const terms = q.replace(/[+\-<>()~*"@]/g, " ").split(/\s+/).filter((t) => t.length > 1).map((t) => `+${t}*`).join(" ");
  if (!terms) return [];
  return prisma.$queryRaw`
    SELECT c.*, MATCH(fullName, headline, currentTitle, currentCompany, summary, skills) AGAINST (${terms} IN BOOLEAN MODE) AS relevance
    FROM Candidate c
    WHERE c.tenantId = ${tenantId}
      AND MATCH(fullName, headline, currentTitle, currentCompany, summary, skills) AGAINST (${terms} IN BOOLEAN MODE)
    ORDER BY relevance DESC, c.fitScore DESC
    LIMIT ${limit}`;
}

/** OR-style search: any term matches (used to pull a broad candidate pool for a role before scoring). */
export async function searchCandidatesAny(tenantId: string, terms: string[], limit = 300): Promise<Array<Candidate & { relevance: number }>> {
  const q = [...new Set(terms.map((t) => t.replace(/[^\p{L}\p{N}]/gu, "")).filter((t) => t.length > 2))].slice(0, 30).map((t) => `${t}*`).join(" ");
  if (!q) return [];
  return prisma.$queryRaw`
    SELECT c.*, MATCH(fullName, headline, currentTitle, currentCompany, summary, skills) AGAINST (${q} IN BOOLEAN MODE) AS relevance
    FROM Candidate c
    WHERE c.tenantId = ${tenantId} AND c.status <> 'REJECTED'
      AND MATCH(fullName, headline, currentTitle, currentCompany, summary, skills) AGAINST (${q} IN BOOLEAN MODE)
    ORDER BY relevance DESC
    LIMIT ${limit}`;
}
