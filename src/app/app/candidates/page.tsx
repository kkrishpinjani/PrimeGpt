import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireCtx } from "@/lib/auth";
import { Empty, Notice, PageHeader, ScorePill, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { searchCandidates } from "@/lib/services/candidates";
import { importCsv, setCandidateStatus } from "../actions/recruiting";

export const metadata = { title: "Candidates" };
const STATUSES = ["NEW", "SAVED", "REJECTED", "CONTACTED", "REPLIED", "INTERVIEWING", "PLACED"] as const;

export default async function Candidates({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; job?: string; min?: string; imported?: string; updated?: string; deleted?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const jobs = await ctx.db.jobOrder.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const min = sp.min ? Number(sp.min) : undefined;

  let rows: Array<{ id: string; fullName: string; currentTitle: string | null; currentCompany: string | null; location: string | null; fitScore: number | null; status: string; source: string; jobOrderId: string | null }>;
  if (sp.q?.trim()) {
    rows = (await searchCandidates(ctx.tenant.id, sp.q, 100)).filter((c) => (!sp.status || c.status === sp.status) && (!sp.job || c.jobOrderId === sp.job) && (min == null || (c.fitScore ?? 0) >= min));
  } else {
    const where: Prisma.CandidateWhereInput = { ...(sp.status ? { status: sp.status as any } : {}), ...(sp.job ? { jobOrderId: sp.job } : {}), ...(min != null ? { fitScore: { gte: min } } : {}) };
    rows = await ctx.db.candidate.findMany({ where, orderBy: [{ fitScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 200 });
  }
  const jobName = new Map(jobs.map((j) => [j.id, j.title]));

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle="Full-text search across names, titles, companies, skills and summaries."
        actions={<><a href="/api/export/candidates" className="btn">Export CSV</a>{ctx.canWrite && <Link href="/app/candidates/new" className="btn btn-primary">Add candidate</Link>}</>}
      />
      {sp.deleted && <Notice tone="ok">Candidate erased.</Notice>}
      {sp.imported && <Notice tone="ok">Imported {sp.imported} new candidates ({sp.updated} updated).</Notice>}

      <form className="card mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_100px_auto]" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Search e.g. “controller manufacturing SAP”" className="input" />
        <select name="job" defaultValue={sp.job ?? ""} className="input"><option value="">All roles</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input"><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>
        <input name="min" type="number" min={0} max={100} defaultValue={sp.min} placeholder="Min score" className="input" />
        <button className="btn btn-primary">Filter</button>
      </form>

      {rows.length === 0 ? <Empty title="No candidates match">Run a search, add someone manually, or import a CSV below.</Empty> : (
        <form action="/app/compare" method="get">
          <div className="mb-2 flex items-center justify-between"><span className="muted">{rows.length} shown</span><button className="btn btn-sm">Compare selected</button></div>
          <div className="card overflow-x-auto p-0">
            <table className="tbl">
              <thead><tr><th className="w-8" /><th>Candidate</th><th>Role</th><th>Source</th><th>Fit</th><th>Status</th>{ctx.canWrite && <th />}</tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" name="ids" value={c.id} aria-label={`Select ${c.fullName}`} /></td>
                    <td><Link href={`/app/candidates/${c.id}`} className="font-medium underline-offset-2 hover:underline">{c.fullName}</Link><div className="muted text-xs">{[c.currentTitle, c.currentCompany, c.location].filter(Boolean).join(" · ")}</div></td>
                    <td className="muted">{c.jobOrderId ? jobName.get(c.jobOrderId) : ""}</td>
                    <td className="muted">{c.source.replaceAll("_", " ")}</td>
                    <td><ScorePill score={c.fitScore} /></td>
                    <td><StatusBadge s={c.status} /></td>
                    {ctx.canWrite && (
                      <td className="whitespace-nowrap text-right">
                        <button formAction={setCandidateStatus.bind(null, c.id, "SAVED") as any} className="btn btn-sm mr-1" formNoValidate>Save</button>
                        <button formAction={setCandidateStatus.bind(null, c.id, "REJECTED") as any} className="btn btn-sm" formNoValidate>Reject</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </form>
      )}

      {ctx.canWrite && (
        <form action={importCsv} className="card mt-8 max-w-xl space-y-3">
          <h2 className="h2">Import from CSV</h2>
          <p className="muted">Columns recognised: name (or first_name + last_name), title, company, location, email, phone, linkedin, summary, skills. Duplicates are merged.</p>
          <input type="file" name="file" accept=".csv,text/csv" required className="input" />
          <select name="jobOrderId" className="input"><option value="">Attach to role (optional, scores on import)</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select>
          <SubmitButton className="btn-primary">Import</SubmitButton>
        </form>
      )}
    </>
  );
}
