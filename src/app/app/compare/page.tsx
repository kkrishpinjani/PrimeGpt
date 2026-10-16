import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Empty, PageHeader, ScorePill } from "@/components/ui";

export const metadata = { title: "Compare" };

const DIMS: Array<[string, string]> = [
  ["must_haves", "Must-haves"], ["seniority_and_scope", "Seniority & scope"], ["industry_relevance", "Industry relevance"],
  ["stability_and_trajectory", "Stability & trajectory"], ["location_fit", "Location fit"],
];

export default async function Compare({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const ctx = await requireCtx();
  const { ids: raw } = await searchParams;
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, 5);
  if (ids.length < 2) return (<><PageHeader title="Compare candidates" /><Empty title="Select 2 to 5 candidates">Tick candidates in the list and press “Compare selected”.</Empty></>);
  const cands = await ctx.db.candidate.findMany({ where: { id: { in: ids } }, include: { jobOrder: true } });
  return (
    <>
      <PageHeader title="Compare candidates" actions={<a className="btn" href={`/api/documents/${ids.join(",")}?kind=compare`}>Export .xlsx</a>} />
      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th />{cands.map((c) => <th key={c.id}><Link href={`/app/candidates/${c.id}`} className="normal-case underline">{c.fullName}</Link></th>)}</tr></thead>
          <tbody>
            <tr><td className="muted">Current role</td>{cands.map((c) => <td key={c.id}>{c.currentTitle}<div className="muted text-xs">{c.currentCompany}</div></td>)}</tr>
            <tr><td className="muted">Location</td>{cands.map((c) => <td key={c.id}>{c.location}</td>)}</tr>
            <tr><td className="muted">Overall fit</td>{cands.map((c) => <td key={c.id}><ScorePill score={c.fitScore} /></td>)}</tr>
            {DIMS.map(([k, l]) => (
              <tr key={k}><td className="muted">{l}</td>{cands.map((c) => <td key={c.id}>{Math.round(Number(((c.scoreBreakdown ?? {}) as any)[k] ?? 0))}</td>)}</tr>
            ))}
            <tr><td className="muted">Rationale</td>{cands.map((c) => <td key={c.id} className="max-w-xs text-xs">{c.scoreRationale}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
