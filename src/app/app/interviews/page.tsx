import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Empty, fmtDate, PageHeader, ScorePill, StatusBadge } from "@/components/ui";

export const metadata = { title: "Interviews" };

export default async function Interviews() {
  const ctx = await requireCtx();
  const [rows, unscheduled] = await Promise.all([
    ctx.db.interview.findMany({ orderBy: { startsAt: "desc" }, include: { candidate: true, jobOrder: true }, take: 100 }),
    // Moved to "Interviewing" in the pipeline, but no interview booked yet
    ctx.db.candidate.findMany({ where: { status: "INTERVIEWING", interviews: { none: {} } }, include: { jobOrder: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  return (
    <>
      <PageHeader title="Interviews" subtitle="Candidates in the interview stage, and the interviews you have scheduled. Connect Google Calendar under Integrations to get Meet links." />

      {unscheduled.length > 0 && (
        <section className="mb-6">
          <h2 className="h2 mb-2">Needs scheduling <span className="badge ml-1">{unscheduled.length}</span></h2>
          <div className="card overflow-x-auto p-0">
            <table className="tbl">
              <thead><tr><th>Candidate</th><th>Role</th><th>Fit</th><th /></tr></thead>
              <tbody>
                {unscheduled.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/app/candidates/${c.id}`} className="font-medium hover:underline">{c.fullName}</Link><div className="muted text-xs">{[c.currentTitle, c.currentCompany].filter(Boolean).join(" · ")}</div></td>
                    <td>{c.jobOrder?.title ?? <span className="muted">none</span>}</td>
                    <td><ScorePill score={c.fitScore} /></td>
                    <td className="text-right">{ctx.canWrite && <Link href={`/app/candidates/${c.id}#schedule`} className="btn btn-primary btn-sm">Schedule interview</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="h2 mb-2">Scheduled <span className="badge ml-1">{rows.length}</span></h2>
        {rows.length === 0 ? <Empty title="No interviews scheduled">Open a candidate and use the Schedule form to book one.</Empty> : (
          <div className="card overflow-x-auto p-0"><table className="tbl"><thead><tr><th>When</th><th>Candidate</th><th>Role</th><th>Link</th><th>Status</th></tr></thead><tbody>
            {rows.map((i) => (
              <tr key={i.id}><td className="whitespace-nowrap">{fmtDate(i.startsAt)}</td><td><Link href={`/app/candidates/${i.candidateId}`} className="font-medium">{i.candidate.fullName}</Link></td><td>{i.jobOrder?.title}</td>
                <td>{i.meetLink ? <a href={i.meetLink} target="_blank" rel="noreferrer" className="underline">Meet</a> : <span className="muted">none</span>}</td><td><StatusBadge s={i.status} /></td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}
