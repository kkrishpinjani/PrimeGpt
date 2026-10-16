import { requireCtx } from "@/lib/auth";
import { Notice, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createSearch } from "../../actions/recruiting";
import { aiConfigured } from "@/lib/brain/claude";

export const metadata = { title: "New search" };

const SOURCES: Array<[string, string, string]> = [
  ["linkedin_recruiter", "LinkedIn Recruiter", "Uses your signed-in browser via the local helper"],
  ["indeed", "Indeed Smart Sourcing", "Uses your signed-in browser via the local helper"],
  ["apollo", "Apollo", "People database (platform key or your own)"],
  ["exa", "Web search (Exa)", "Public profiles found on the web"],
];

export default async function NewSearch({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const { job } = await searchParams;
  const jobs = await ctx.db.jobOrder.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" } });
  const online = await ctx.db.executorDevice.count({ where: { online: true, revokedAt: null } });
  return (
    <>
      <PageHeader title="New search" subtitle="Pick a role and sources. Leave titles and keywords blank and we will derive them from the role." />
      {online === 0 && <Notice tone="warn">Your local helper is offline. LinkedIn and Indeed runs need it; API sources work without it.</Notice>}
      {!aiConfigured() && <Notice tone="info">AI is not configured on this server, so scoring uses the built-in keyword scorer.</Notice>}
      <form action={createSearch} className="card max-w-3xl space-y-4">
        <div><label className="label">Search name</label><input name="name" className="input" placeholder="e.g. VP Finance, Chicago" required /></div>
        <div>
          <label className="label">Role</label>
          <select name="jobOrderId" className="input" defaultValue={job ?? ""}>
            <option value="">No role (unscored)</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Titles (one per line)</label><textarea name="titles" className="input" /></div>
          <div><label className="label">Keywords / skills</label><textarea name="keywords" className="input" /></div>
          <div><label className="label">Locations</label><textarea name="locations" className="input" /></div>
          <div><label className="label">Exclude (companies, terms)</label><textarea name="excludes" className="input" /></div>
        </div>
        <fieldset>
          <legend className="label">Sources</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SOURCES.map(([v, l, d], i) => (
              <label key={v} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
                <input type="checkbox" name="sources" value={v} defaultChecked={i === 0} className="mt-1" />
                <span><span className="font-medium">{l}</span><br /><span className="muted text-xs">{d}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="max-w-40"><label className="label">Max results per source</label><input name="maxResults" type="number" min={5} max={100} defaultValue={25} className="input" /></div>
        <SubmitButton className="btn-primary" pending="Starting…">Start search</SubmitButton>
      </form>
    </>
  );
}
