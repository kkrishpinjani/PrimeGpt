import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Empty, fmtDate, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Runs" };

const TYPES = ["SOURCING", "MATCH_ROLE", "SCORING", "BRIEF", "OUTREACH_DRAFT", "FOLLOWUP_DRAFT", "INBOX_WATCH", "PROSPECTING", "SEND_MESSAGE"] as const;
const label = (t: string) => t.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default async function Runs({ searchParams }: { searchParams: Promise<{ type?: string; status?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const runs = await ctx.db.run.findMany({
    where: { ...(sp.type ? { type: sp.type as any } : {}), ...(sp.status ? { status: sp.status as any } : {}) },
    orderBy: { createdAt: "desc" }, take: 200, include: { search: true },
  });
  return (
    <>
      <PageHeader title="Runs" subtitle="Everything the platform has done in the background for this workspace: searches, matching, drafting, sending and inbox checks." />
      <form method="get" className="card mb-4 flex flex-wrap items-center gap-3">
        <select name="type" defaultValue={sp.type ?? ""} className="input w-52"><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input w-48"><option value="">Any status</option>{["QUEUED", "RUNNING", "NEEDS_HUMAN", "SUCCEEDED", "FAILED", "CANCELED"].map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}</select>
        <button className="btn btn-primary">Filter</button>
      </form>
      {runs.length === 0 ? <Empty title="No runs yet">Start a search, match a role, or draft outreach and it will show up here.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr><th>Run</th><th>Status</th><th>Result</th><th>Started</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/app/runs/${r.id}`} className="font-medium hover:underline">{label(r.type)}</Link>{r.search && <div className="muted text-xs">{r.search.name}</div>}</td>
                  <td><StatusBadge s={r.status} /></td>
                  <td className="max-w-lg text-xs muted">{r.summary ?? (r.error ? <span className="text-bad">{r.error.slice(0, 140)}</span> : "")}</td>
                  <td className="whitespace-nowrap text-xs muted">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
