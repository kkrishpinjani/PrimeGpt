import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { PageHeader, ScorePill } from "@/components/ui";
import { setCandidateStatus } from "../actions/recruiting";

export const metadata = { title: "Pipeline" };

const COLS = ["NEW", "SAVED", "CONTACTED", "REPLIED", "INTERVIEWING", "PLACED"] as const;
const NEXT: Record<string, (typeof COLS)[number] | undefined> = { NEW: "SAVED", SAVED: "CONTACTED", CONTACTED: "REPLIED", REPLIED: "INTERVIEWING", INTERVIEWING: "PLACED" };

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const ctx = await requireCtx();
  const { job } = await searchParams;
  const [jobs, cands] = await Promise.all([
    ctx.db.jobOrder.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" } }),
    ctx.db.candidate.findMany({ where: { status: { in: [...COLS] }, ...(job ? { jobOrderId: job } : {}) }, orderBy: { fitScore: { sort: "desc", nulls: "last" } }, take: 500 }),
  ]);
  return (
    <>
      <PageHeader title="Pipeline" subtitle="Where every candidate stands." actions={
        <form method="get"><select name="job" defaultValue={job ?? ""} className="input" onChange={undefined}><option value="">All roles</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select><button className="btn btn-sm ml-2">Apply</button></form>
      } />
      <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${COLS.length}, minmax(210px, 1fr))` }}>
        {COLS.map((col) => {
          const items = cands.filter((c) => c.status === col);
          return (
            <section key={col} className="rounded-xl border border-line bg-panel/60 p-3">
              <h2 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">{col.toLowerCase()}<span className="badge">{items.length}</span></h2>
              <ul className="space-y-2">
                {items.map((c) => (
                  <li key={c.id} className="rounded-lg border border-line bg-panel p-2.5 text-sm">
                    <div className="flex items-start justify-between gap-2"><Link href={`/app/candidates/${c.id}`} className="font-medium hover:underline">{c.fullName}</Link><ScorePill score={c.fitScore} /></div>
                    <div className="muted truncate text-xs">{c.currentTitle}</div>
                    {ctx.canWrite && NEXT[col] && (
                      <form action={setCandidateStatus.bind(null, c.id, NEXT[col]!)} className="mt-2"><button className="btn btn-sm w-full">Move to {NEXT[col]!.toLowerCase()} →</button></form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
