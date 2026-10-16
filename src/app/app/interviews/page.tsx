import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Empty, fmtDate, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Interviews" };

export default async function Interviews() {
  const ctx = await requireCtx();
  const rows = await ctx.db.interview.findMany({ orderBy: { startsAt: "desc" }, include: { candidate: true, jobOrder: true }, take: 100 });
  return (
    <>
      <PageHeader title="Interviews" subtitle="Scheduled from a candidate page. Connect Google Calendar under Integrations to get Meet links." />
      {rows.length === 0 ? <Empty title="No interviews scheduled" /> : (
        <div className="card overflow-x-auto p-0"><table className="tbl"><thead><tr><th>When</th><th>Candidate</th><th>Role</th><th>Link</th><th>Status</th></tr></thead><tbody>
          {rows.map((i) => (
            <tr key={i.id}><td className="whitespace-nowrap">{fmtDate(i.startsAt)}</td><td><Link href={`/app/candidates/${i.candidateId}`} className="font-medium">{i.candidate.fullName}</Link></td><td>{i.jobOrder?.title}</td>
              <td>{i.meetLink ? <a href={i.meetLink} target="_blank" rel="noreferrer" className="underline">Meet</a> : <span className="muted">none</span>}</td><td><StatusBadge s={i.status} /></td></tr>
          ))}
        </tbody></table></div>
      )}
    </>
  );
}
