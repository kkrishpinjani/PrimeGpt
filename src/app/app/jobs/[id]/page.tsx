import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { PageHeader, ScorePill, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { JobForm } from "@/components/job-form";
import { attachMatch, matchRole, rescoreJob, updateJobOrder } from "../../actions/recruiting";

export const metadata = { title: "Role" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const job = await ctx.db.jobOrder.findFirst({ where: { id }, include: { client: true } });
  if (!job) notFound();
  const cands = await ctx.db.candidate.findMany({ where: { jobOrderId: id, status: { not: "REJECTED" } }, orderBy: { fitScore: { sort: "desc", nulls: "last" } }, take: 25 });
  const matches = await ctx.db.jobMatch.findMany({ where: { jobOrderId: id }, orderBy: { score: "desc" }, include: { candidate: true }, take: 25 });
  return (
    <>
      <PageHeader
        title={job.title}
        subtitle={[job.client?.name, job.location].filter(Boolean).join(" · ")}
        actions={ctx.canWrite && (
          <>
            <Link href={`/app/searches/new?job=${job.id}`} className="btn btn-primary">Run a search</Link>
            <form action={matchRole.bind(null, job.id)}><SubmitButton pending="Starting…">Match from my database</SubmitButton></form>
            <form action={rescoreJob.bind(null, job.id)}><SubmitButton>Re-score all</SubmitButton></form>
            <a href={`/api/documents/${job.id}?kind=shortlist`} className="btn">Shortlist .xlsx</a>
          </>
        )}
      />
      <section className="card mb-6">
        <h2 className="h2 mb-3">Shortlist ({cands.length})</h2>
        {cands.length === 0 ? <p className="muted">No candidates attached yet.</p> : (
          <table className="tbl"><tbody>
            {cands.map((c, i) => (
              <tr key={c.id}><td className="w-8 text-muted">{i + 1}</td><td><Link href={`/app/candidates/${c.id}`} className="font-medium hover:underline">{c.fullName}</Link><div className="muted text-xs">{c.currentTitle} {c.currentCompany && `· ${c.currentCompany}`}</div></td><td><ScorePill score={c.fitScore} /></td><td><StatusBadge s={c.status} /></td></tr>
            ))}
          </tbody></table>
        )}
      </section>
      <section className="card mb-6">
        <h2 className="h2 mb-1">Matches from your talent database ({matches.length})</h2>
        <p className="muted mb-3">People already in your database ranked against this role. Add the good ones to the shortlist.</p>
        {matches.length === 0 ? <p className="muted">No matches yet. Click <b>Match from my database</b>.</p> : (
          <table className="tbl"><tbody>
            {matches.map((m) => (
              <tr key={m.id}>
                <td><Link href={`/app/candidates/${m.candidateId}`} className="font-medium hover:underline">{m.candidate.fullName}</Link><div className="muted text-xs">{[m.candidate.currentTitle, m.candidate.currentCompany, m.candidate.location].filter(Boolean).join(" · ")}</div></td>
                <td><ScorePill score={m.score} /></td>
                <td className="max-w-md text-xs muted">{m.rationale}</td>
                <td className="text-right">{m.candidate.jobOrderId === job.id ? <span className="badge">on shortlist</span> : ctx.canWrite && <form action={attachMatch.bind(null, m.id)}><SubmitButton className="btn-sm">Add to shortlist</SubmitButton></form>}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </section>
      {ctx.canWrite && <JobForm action={updateJobOrder.bind(null, job.id)} job={job} submit="Save changes" />}
    </>
  );
}
