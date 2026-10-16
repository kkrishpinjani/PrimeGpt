import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Roles" };

export default async function Jobs() {
  const ctx = await requireCtx();
  const jobs = await ctx.db.jobOrder.findMany({ orderBy: { createdAt: "desc" }, include: { client: true, _count: { select: { candidates: true } } } });
  return (
    <>
      <PageHeader title="Roles" subtitle="Job orders. Must-haves here drive scoring." actions={ctx.canWrite && <Link href="/app/jobs/new" className="btn btn-primary">New role</Link>} />
      {jobs.length === 0 ? <Empty title="No roles yet">Create a role with must-haves, then run a search against it.</Empty> : (
        <div className="card overflow-x-auto p-0"><table className="tbl"><thead><tr><th>Role</th><th>Client</th><th>Location</th><th>Candidates</th><th>Status</th></tr></thead><tbody>
          {jobs.map((j) => <tr key={j.id}><td><Link href={`/app/jobs/${j.id}`} className="font-medium hover:underline">{j.title}</Link></td><td>{j.client?.name ?? <span className="muted">—</span>}</td><td>{j.location}</td><td>{j._count.candidates}</td><td><StatusBadge s={j.status} /></td></tr>)}
        </tbody></table></div>
      )}
    </>
  );
}
