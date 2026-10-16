import { requireCtx } from "@/lib/auth";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { runProspecting, setProspectStatus } from "../actions/recruiting";

export const metadata = { title: "Prospects" };

export default async function Prospects() {
  const ctx = await requireCtx();
  const rows = await ctx.db.prospect.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Prospects" subtitle="Client acquisition: find target companies and decision makers, then approve the intro emails in Outreach." />
      {ctx.canWrite && (
        <form action={runProspecting} className="card mb-6 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">Who should we find? Titles (one per line)</label><textarea name="titles" required className="input" placeholder={"VP Human Resources\nChief People Officer"} /></div>
          <div><label className="label">Keywords / industry</label><input name="keywords" className="input" placeholder="manufacturing, 200-1000 employees" /></div>
          <div><label className="label">Locations</label><input name="locations" className="input" /></div>
          <div><label className="label">Specific company domains (optional)</label><input name="domains" className="input" placeholder="acme.com, globex.com" /></div>
          <div><label className="label">How many</label><input name="limit" type="number" defaultValue={25} max={100} className="input" /></div>
          <div className="sm:col-span-2"><SubmitButton className="btn-primary">Find prospects</SubmitButton></div>
        </form>
      )}
      {rows.length === 0 ? <Empty title="No prospects yet">Uses Apollo (platform key or your own, set under Integrations).</Empty> : (
        <div className="card overflow-x-auto p-0"><table className="tbl"><thead><tr><th>Company</th><th>Contact</th><th>Why</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map((p) => (
            <tr key={p.id}><td className="font-medium">{p.company}<div className="muted text-xs">{p.domain}</div></td><td>{p.contactName}<div className="muted text-xs">{p.contactTitle}</div></td><td className="max-w-sm text-xs">{p.rationale}</td><td><StatusBadge s={p.status} /></td>
              <td className="whitespace-nowrap text-right">{ctx.canWrite && (["contacted", "converted", "dropped"] as const).map((s) => <form key={s} action={setProspectStatus.bind(null, p.id, s)} className="ml-1 inline"><button className="btn btn-sm">{s}</button></form>)}</td></tr>
          ))}
        </tbody></table></div>
      )}
    </>
  );
}
