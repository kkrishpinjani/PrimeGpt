import type { Candidate, Run } from "@prisma/client";
import { prisma } from "@/lib/db";
import { heuristicScore, scoreCandidate, tokens } from "@/lib/brain/scoring";
import { searchCandidatesAny } from "@/lib/services/candidates";
import { runEvent } from "@/lib/services/runs";

const AI_RESCORE_TOP = 25; // keep AI cost bounded: cheap keyword pass on everyone, full read only on the best
const KEEP = 50;

/**
 * "Matches": rank the workspace's existing talent database against a role (scope §3.2, WS2 shortlisting).
 * Pull a broad pool with full-text search, score everyone cheaply, re-score the top few with the full scorer.
 */
export async function runMatchRole(run: Run) {
  const { tenantId } = run;
  const job = await prisma.jobOrder.findFirst({ where: { id: (run.params as any)?.jobOrderId, tenantId } });
  if (!job) throw new Error("Job order not found");

  const terms = [...new Set(tokens([job.title, job.mustHaves, job.niceToHaves, job.description?.slice(0, 600)].filter(Boolean).join(" ")))].slice(0, 30);
  let pool = (await searchCandidatesAny(tenantId, terms, 300)) as Candidate[];
  await runEvent(run.id, `Full-text pool: ${pool.length} candidates for terms [${terms.slice(0, 10).join(", ")}…]`);
  if (pool.length < 30) {
    // thin database or very specific role: top up with recent candidates so scoring still has something to rank
    const have = new Set(pool.map((c) => c.id));
    const more = await prisma.candidate.findMany({ where: { tenantId, status: { not: "REJECTED" }, id: { notIn: [...have] } }, orderBy: { createdAt: "desc" }, take: 100 });
    pool = [...pool, ...more];
  }
  pool = pool.filter((c) => c.jobOrderId !== job.id); // already on this role's shortlist

  const first = pool.map((c) => ({ c, h: heuristicScore(job, c) })).sort((a, b) => b.h.score - a.h.score);
  const top = first.slice(0, KEEP);
  await prisma.run.update({ where: { id: run.id }, data: { progress: 40 } });

  let n = 0;
  for (const [i, { c, h }] of top.entries()) {
    const r = i < AI_RESCORE_TOP ? await scoreCandidate(tenantId, job, c) : h;
    await prisma.jobMatch.upsert({
      where: { jobOrderId_candidateId: { jobOrderId: job.id, candidateId: c.id } },
      create: { tenantId, jobOrderId: job.id, candidateId: c.id, score: r.score, rationale: r.rationale, breakdown: { ...r.breakdown, gaps: r.gaps, engine: r.engine } },
      update: { score: r.score, rationale: r.rationale, breakdown: { ...r.breakdown, gaps: r.gaps, engine: r.engine } },
    });
    n++;
    await prisma.run.update({ where: { id: run.id }, data: { progress: 40 + Math.round(((i + 1) / top.length) * 55) } });
  }
  return `Ranked ${pool.length} people from your database; saved the top ${n} matches for "${job.title}".`;
}
