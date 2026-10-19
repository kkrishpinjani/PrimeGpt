import { requireCtx } from "@/lib/auth";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { enrichProspect, runProspecting, setProspectStatus } from "../actions/recruiting";

export const metadata = { title: "Prospects" };

export default async function Prospects() {
  const ctx = await requireCtx();
  const rows = await ctx.db.prospect.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Prospects" subtitle="Client acquisition: find target companies and decision makers, then approve the intro emails in Outreach." />
      {ctx.canWrite && (
        <form action={runProspecting} className="card mb-6 grid gap-3 sm:grid-cols-2">
          <fieldset className="sm:col-span-2">
            <legend className="label">What should we find?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm"><input type="radio" name="mode" value="people" defaultChecked className="mt-1" /><span><span className="font-medium">Decision makers</span><br /><span className="muted text-xs">Search people by title (Apollo). Drafts an intro email for each who has an email address.</span></span></label>
              <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm"><input type="radio" name="mode" value="companies" className="mt-1" /><span><span className="font-medium">Target companies</span><br /><span className="muted text-xs">Search the web (Exa) for companies, then use “Find contact” on each to enrich it with a decision maker.</span></span></label>
            </div>
          </fieldset>
          <div className="sm:col-span-2"><label className="label">Titles to find (one per line, for “Decision makers”)</label><textarea name="titles" className="input" placeholder={"VP Human Resources\nChief People Officer"} /></div>
          <div className="sm:col-span-2"><label className="label">Web search query (for “Target companies”)</label><input name="query" className="input" placeholder="mid-size manufacturers in the Midwest hiring finance leaders" /></div>
          <div><label className="label">Keywords / industry</label><input name="keywords" className="input" placeholder="manufacturing, 200-1000 employees" /></div>
          <div><label className="label">Locations</label><input name="locations" className="input" /></div>
          <div><label className="label">Specific company domains (optional)</label><input name="domains" className="input" placeholder="acme.com, globex.com" /></div>
          <div><label className="label">How many</label><input name="limit" type="number" defaultValue={25} max={100} className="input" /></div>
          <div className="sm:col-span-2"><SubmitButton className="btn-primary">Find prospects</SubmitButton></div>
        </form>
      )}
      {rows.length === 0 ? <Empty title="No prospects yet">Uses Apollo and Exa (platform keys or your own, set under Integrations).</Empty> : (
        <div className="card overflow-x-auto p-0"><table className="tbl"><thead><tr><th>Company</th><th>Contact</th><th>Why</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="font-medium">{p.company}<div className="muted text-xs">{p.domain}</div></td>
              <td>{p.contactName ? <>{p.contactName}<div className="muted text-xs">{p.contactTitle}</div></> : ctx.canWrite && p.domain ? <form action={enrichProspect.bind(null, p.id)}><SubmitButton className="btn-sm" pending="Starting…">Find contact</SubmitButton></form> : <span className="muted">—</span>}</td>
              <td className="max-w-sm text-xs">{p.rationale}</td>
              <td><StatusBadge s={p.status} /></td>
              <td className="whitespace-nowrap text-right">{ctx.canWrite && (["contacted", "converted", "dropped"] as const).map((s) => <form key={s} action={setProspectStatus.bind(null, p.id, s)} className="ml-1 inline"><button className="btn btn-sm">{s}</button></form>)}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
    </>
  );
}
