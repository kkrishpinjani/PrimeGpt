import { requireCtx } from "@/lib/auth";
import { fmtDate, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createExpertRequest } from "../actions/expert";

export const metadata = { title: "Expert help" };

export default async function ExpertHelp({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const ctx = await requireCtx();
  const { sent } = await searchParams;
  const mine = await ctx.db.expertRequest.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <>
      <PageHeader title="Expert help" subtitle="RecruitGPT handles the sourcing. When a search is too important to leave to software, Expert Recruiting's recruiters can run it for you." />
      {sent && <Notice tone="ok">Thanks. We have your request and will be in touch.</Notice>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="card">
          <h2 className="h2">Human-led Talent Search</h2>
          <p className="muted mt-2">Full executive, professional and frontline search run by an Expert Recruiting recruiter, using the same platform you already have. Good for confidential, senior or hard-to-fill roles.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>A dedicated recruiter owns the search end to end</li>
            <li>Your shortlist and briefs land in this workspace</li>
            <li>Also available: 1:1 career coaching for your candidates</li>
          </ul>
        </section>
        {ctx.canWrite ? (
          <form action={createExpertRequest} className="card space-y-3">
            <h2 className="h2">Ask for help</h2>
            <div><label className="label">What do you need?</label>
              <select name="kind" className="input" defaultValue="talent_search"><option value="talent_search">A recruiter to run a search for me</option><option value="coaching">Career coaching</option><option value="other">Something else</option></select></div>
            <div><label className="label">Tell us about it</label><textarea name="message" required minLength={10} className="input min-h-32" placeholder="Role, level, location, how confidential, timeline…" /></div>
            <SubmitButton className="btn-primary" pending="Sending…">Send request</SubmitButton>
          </form>
        ) : <section className="card"><p className="muted">Ask a recruiter or admin on your team to send a request.</p></section>}
      </div>
      {mine.length > 0 && (
        <section className="card mt-6">
          <h2 className="h2 mb-3">Your requests</h2>
          <ul className="divide-y divide-line">
            {mine.map((r) => <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"><span className="max-w-2xl"><span className="muted text-xs">{fmtDate(r.createdAt)} · {r.kind.replace("_", " ")}</span><br />{r.message}</span><StatusBadge s={r.status} /></li>)}
          </ul>
        </section>
      )}
    </>
  );
}
