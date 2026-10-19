import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { Badge, fmtDate, Notice, PageHeader, ScorePill, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { MiniMarkdown } from "@/components/mini-markdown";
import { isDoNotContact } from "@/lib/brain/rules";
import { requestBrief, saveCandidateNotes, scheduleInterview, setCandidateStatus } from "../../actions/recruiting";
import { draftMessage } from "../../actions/outreach";
import { deleteCandidate, updateCandidate } from "../../actions/data";

export const metadata = { title: "Candidate" };

const DIMS: Array<[string, string]> = [
  ["must_haves", "Must-haves"], ["seniority_and_scope", "Seniority & scope"], ["industry_relevance", "Industry relevance"],
  ["stability_and_trajectory", "Stability & trajectory"], ["location_fit", "Location fit"],
];

export default async function CandidatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { error } = await searchParams;
  const c = await ctx.db.candidate.findFirst({
    where: { id },
    include: { jobOrder: { include: { client: true } }, messages: { orderBy: { createdAt: "asc" } }, interviews: { orderBy: { startsAt: "asc" } } },
  });
  if (!c) notFound();
  const dnc = await isDoNotContact(ctx.tenant.id, c);
  const bd = (c.scoreBreakdown ?? {}) as Record<string, any>;
  const pendingBrief = await ctx.db.run.findFirst({ where: { type: "BRIEF", status: { in: ["QUEUED", "RUNNING"] }, params: { path: "$.candidateId", equals: id } } });

  return (
    <>
      <PageHeader
        title={c.fullName}
        subtitle={[c.currentTitle ?? c.headline, c.currentCompany, c.location].filter(Boolean).join(" · ")}
        actions={
          <>
            <ScorePill score={c.fitScore} /><StatusBadge s={c.status} />
            {ctx.canWrite && c.status !== "SAVED" && <form action={setCandidateStatus.bind(null, c.id, "SAVED")}><SubmitButton className="btn-sm">Save</SubmitButton></form>}
            {ctx.canWrite && c.status !== "REJECTED" && <form action={setCandidateStatus.bind(null, c.id, "REJECTED")}><SubmitButton className="btn-sm">Reject</SubmitButton></form>}
          </>
        }
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {dnc && <Notice tone="bad">This person is on the do-not-contact list. Outreach is blocked.</Notice>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="h2">Fit analysis{c.jobOrder && <span className="muted font-normal"> for {c.jobOrder.title}{c.jobOrder.client && ` (${c.jobOrder.client.name})`}</span>}</h2>
            {c.fitScore == null ? <p className="muted mt-2">Not scored. Attach this candidate to a role and re-score from the role page.</p> : (
              <>
                <div className="mt-3 space-y-2">
                  {DIMS.map(([k, l]) => (
                    <div key={k} className="grid grid-cols-[150px_1fr_36px] items-center gap-3 text-sm">
                      <span className="muted">{l}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand" style={{ width: `${Number(bd[k] ?? 0)}%` }} /></div>
                      <span className="text-right">{Math.round(Number(bd[k] ?? 0))}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm">{c.scoreRationale}</p>
                {Array.isArray(bd.gaps) && bd.gaps.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{bd.gaps.map((g: string) => <Badge key={g} tone="warn">gap: {g}</Badge>)}</div>}
                <p className="muted mt-3 text-xs">Scored by {bd.engine === "claude" ? "AI" : "keyword scorer"}.</p>
              </>
            )}
          </section>

          <section className="card">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">Brief</h2>
              <div className="flex gap-2">
                {c.brief && <a href={`/api/documents/${c.id}?kind=brief`} className="btn btn-sm">Download .docx</a>}
                {ctx.canWrite && <form action={requestBrief.bind(null, c.id)}><SubmitButton className="btn-sm">{c.brief ? "Regenerate" : "Generate brief"}</SubmitButton></form>}
              </div>
            </div>
            {pendingBrief && <Notice tone="info">Generating… refresh in a few seconds.</Notice>}
            {c.brief ? <MiniMarkdown text={c.brief} /> : <p className="muted">No brief yet.</p>}
          </section>

          <section className="card">
            <h2 className="h2 mb-3">Message history</h2>
            {c.messages.length === 0 ? <p className="muted">Nothing sent or received.</p> : (
              <ol className="space-y-3">
                {c.messages.map((m) => (
                  <li key={m.id} className={`rounded-lg border border-line p-3 text-sm ${m.direction === "INBOUND" ? "bg-brand/5" : ""}`}>
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                      <Badge>{m.channel.toLowerCase()}</Badge><span className="muted">{m.direction === "INBOUND" ? "received" : "to them"} · {fmtDate(m.sentAt ?? m.createdAt)}</span>
                      <StatusBadge s={m.status} />{m.classification && <Badge tone="info">{m.classification.replace("_", " ")}</Badge>}
                    </div>
                    {m.subject && <div className="font-medium">{m.subject}</div>}
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card">
            <h2 className="h2 mb-2">Contact</h2>
            <dl className="space-y-1 text-sm">
              <div><dt className="label inline">Email: </dt><dd className="inline">{c.email ?? "—"}</dd></div>
              <div><dt className="label inline">Phone: </dt><dd className="inline">{c.phone ?? "—"}</dd></div>
              <div><dt className="label inline">LinkedIn: </dt><dd className="inline">{c.linkedinUrl ? <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="underline">profile</a> : "—"}</dd></div>
              <div><dt className="label inline">Source: </dt><dd className="inline">{c.source.replaceAll("_", " ")}</dd></div>
            </dl>
            {ctx.canWrite && !dnc && (
              <div className="mt-4 space-y-2 border-t border-line pt-4">
                <div className="label">Draft outreach (you approve before anything sends)</div>
                <div className="flex flex-wrap gap-2">
                  {(["EMAIL", "SMS", "LINKEDIN"] as const).map((ch) => (
                    <form key={ch} action={draftMessage.bind(null, c.id, ch)}><SubmitButton className="btn-sm" pending="Drafting…">{ch === "LINKEDIN" ? "InMail" : ch === "SMS" ? "SMS" : "Email"}</SubmitButton></form>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="h2 mb-2">Notes</h2>
            <form action={saveCandidateNotes.bind(null, c.id)} className="space-y-2">
              <textarea name="notes" defaultValue={c.notes ?? ""} className="input" disabled={!ctx.canWrite} />
              {ctx.canWrite && <SubmitButton className="btn-sm">Save notes</SubmitButton>}
            </form>
          </section>

          <section className="card scroll-mt-6" id="schedule">
            <h2 className="h2 mb-2">Interviews</h2>
            {c.interviews.map((i) => (
              <div key={i.id} className="mb-2 text-sm"><div>{fmtDate(i.startsAt)}</div>{i.meetLink && <a href={i.meetLink} target="_blank" rel="noreferrer" className="underline">Meet link</a>}</div>
            ))}
            {ctx.canWrite && (
              <form action={scheduleInterview.bind(null, c.id)} className="mt-2 space-y-2 border-t border-line pt-3">
                <input type="datetime-local" name="startsAt" required className="input" />
                <div className="grid grid-cols-2 gap-2"><input name="minutes" type="number" defaultValue={30} min={15} step={15} className="input" aria-label="Minutes" /><input name="attendees" placeholder="Extra attendee emails" className="input" /></div>
                <SubmitButton className="btn-sm">Schedule</SubmitButton>
                <p className="muted text-xs">Creates a Google Calendar event with a Meet link when Calendar is connected.</p>
              </form>
            )}
          </section>
          {ctx.canWrite && (
            <section className="card">
              <details>
                <summary className="h2 cursor-pointer">Edit details</summary>
                <form action={updateCandidate.bind(null, c.id)} className="mt-3 space-y-2">
                  <div><label className="label">Full name</label><input name="fullName" defaultValue={c.fullName} required className="input" /></div>
                  <div><label className="label">Title</label><input name="currentTitle" defaultValue={c.currentTitle ?? ""} className="input" /></div>
                  <div><label className="label">Company</label><input name="currentCompany" defaultValue={c.currentCompany ?? ""} className="input" /></div>
                  <div><label className="label">Headline</label><input name="headline" defaultValue={c.headline ?? ""} className="input" /></div>
                  <div><label className="label">Location</label><input name="location" defaultValue={c.location ?? ""} className="input" /></div>
                  <div><label className="label">Email</label><input name="email" type="email" defaultValue={c.email ?? ""} className="input" /></div>
                  <div><label className="label">Phone</label><input name="phone" defaultValue={c.phone ?? ""} className="input" /></div>
                  <div><label className="label">LinkedIn URL</label><input name="linkedinUrl" defaultValue={c.linkedinUrl ?? ""} className="input" /></div>
                  <div><label className="label">Skills</label><input name="skills" defaultValue={c.skills ?? ""} className="input" /></div>
                  <div><label className="label">Summary</label><textarea name="summary" defaultValue={c.summary ?? ""} className="input" /></div>
                  <SubmitButton className="btn-primary btn-sm">Save changes</SubmitButton>
                </form>
              </details>
            </section>
          )}
          {ctx.canWrite && (
            <section className="card border-bad/30">
              <details>
                <summary className="h2 cursor-pointer text-bad">Erase this person</summary>
                <form action={deleteCandidate.bind(null, c.id)} className="mt-3 space-y-3">
                  <p className="muted">Permanently deletes this candidate and every message logged against them.</p>
                  <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="keepDnc" defaultChecked className="mt-1" /><span>Also add them to the do-not-contact list so they are not re-imported and contacted again</span></label>
                  <SubmitButton className="btn-danger btn-sm" confirm="Permanently delete this candidate and their messages? This cannot be undone.">Delete permanently</SubmitButton>
                </form>
              </details>
            </section>
          )}
          <Link href="/app/candidates" className="muted text-sm underline">← All candidates</Link>
        </aside>
      </div>
    </>
  );
}
