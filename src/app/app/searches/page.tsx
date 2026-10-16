import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Empty, fmtDate, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { rerunSearch } from "../actions/recruiting";

export const metadata = { title: "Searches" };

export default async function Searches() {
  const ctx = await requireCtx();
  const searches = await ctx.db.savedSearch.findMany({ orderBy: { createdAt: "desc" }, include: { jobOrder: true, runs: { orderBy: { createdAt: "desc" }, take: 1 } } });
  return (
    <>
      <PageHeader title="Searches" subtitle="Saved sourcing searches and their latest run." actions={ctx.canWrite && <Link href="/app/searches/new" className="btn btn-primary">New search</Link>} />
      {searches.length === 0 ? <Empty title="No searches yet">Create a search to source candidates from LinkedIn, Indeed, Apollo or the web.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Role</th><th>Sources</th><th>Last run</th><th /></tr></thead>
            <tbody>
              {searches.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td>{s.jobOrder?.title ?? <span className="muted">none</span>}</td>
                  <td className="muted">{s.sources.replaceAll("_", " ").replaceAll(",", ", ")}</td>
                  <td>{s.runs[0] ? <Link href={`/app/runs/${s.runs[0].id}`} className="flex items-center gap-2"><StatusBadge s={s.runs[0].status} /><span className="muted text-xs">{fmtDate(s.runs[0].createdAt)}</span></Link> : <span className="muted">never</span>}</td>
                  <td className="text-right">{ctx.canWrite && <form action={rerunSearch.bind(null, s.id)}><SubmitButton className="btn-sm">Run again</SubmitButton></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
