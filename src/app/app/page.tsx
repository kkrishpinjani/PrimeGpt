import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Badge, Empty, fmtDate, PageHeader, ScorePill, Stat, StatusBadge } from "@/components/ui";
import { Briefcase, CircleDollarSign, Send, Users } from "lucide-react";
import { monthlyAiSpendCents } from "@/lib/brain/claude";
import { Onboarding } from "@/components/onboarding";
import { listConnected } from "@/lib/integrations/store";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const ctx = await requireCtx();
  const { denied } = await searchParams;
  const db = ctx.db;
  const [candidates, newCount, saved, awaiting, openJobs, runs, top, device, spend, interviews, jobsTotal, sentCount, connected] = await Promise.all([
    db.candidate.count(),
    db.candidate.count({ where: { status: "NEW" } }),
    db.candidate.count({ where: { status: "SAVED" } }),
    db.message.count({ where: { status: "DRAFT", direction: "OUTBOUND" } }),
    db.jobOrder.count({ where: { status: "open" } }),
    db.run.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    db.candidate.findMany({ where: { status: { in: ["NEW", "SAVED"] }, fitScore: { not: null } }, orderBy: { fitScore: "desc" }, take: 6 }),
    db.executorDevice.findFirst({ where: { revokedAt: null, tokenHash: { not: null } }, orderBy: { lastSeenAt: "desc" } }),
    monthlyAiSpendCents(ctx.tenant.id),
    db.interview.findMany({ where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 4, include: { candidate: true } }),
    db.jobOrder.count(),
    db.message.count({ where: { direction: "OUTBOUND", status: { in: ["APPROVED", "SENDING", "SENT"] } } }),
    listConnected(ctx.tenant.id),
  ]);
  const steps = [
    { label: "Activate your subscription", hint: "Unlocks searches, AI and sending", href: "/app/billing", done: ctx.active },
    { label: "Create your first role", hint: "Must-haves drive the scoring", href: "/app/jobs/new", done: jobsTotal > 0 },
    { label: "Add or source candidates", hint: "Run a search, or import a CSV", href: "/app/searches/new", done: candidates > 0 },
    { label: "Connect Gmail", hint: "Send email, watch replies, book Meet links", href: "/app/integrations", done: connected.some((c) => c.provider === "gmail") },
    { label: "Pair the local helper", hint: "Needed for LinkedIn and Indeed", href: "/app/integrations", done: !!device },
    { label: "Approve your first message", hint: "Draft, review, approve, send", href: "/app/outreach", done: sentCount > 0 },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${ctx.user.name.split(" ")[0]}`}
        subtitle="Your pipeline at a glance."
        actions={<><Link href="/app/searches/new" className="btn btn-primary">New search</Link><Link href="/app/jobs/new" className="btn">New role</Link></>}
      />
      {denied && <div className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm">You do not have permission for that page.</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Candidates" value={candidates} hint={`${newCount} new · ${saved} saved`} />
        <Stat icon={Briefcase} label="Open roles" value={openJobs} />
        <Stat icon={Send} label="Awaiting approval" value={awaiting} hint="Draft messages" />
        <Stat icon={CircleDollarSign} label="AI spend this month" value={`$${(spend / 100).toFixed(2)}`} hint={`Budget $${(ctx.tenant.aiMonthlyBudgetCents / 100).toFixed(0)}`} />
      </div>

      {!ctx.tenant.onboardingDismissed && steps.some((s) => !s.done) && <Onboarding steps={steps} canDismiss={ctx.isAdmin} />}

      {!device && (
        <div className="card mt-6 border-brand/30">
          <h2 className="h2">Connect your local helper</h2>
          <p className="muted mt-1">LinkedIn Recruiter and Indeed sourcing runs in your own browser. <Link href="/app/integrations" className="underline">Pair the helper</Link> to enable it. API sources (Apollo, web search, CSV) work without it.</p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="mb-3 flex items-center justify-between"><h2 className="h2">Top candidates to review</h2><Link href="/app/candidates" className="muted underline">All</Link></div>
          {top.length === 0 ? <p className="muted">No scored candidates yet. Start a search or import a CSV.</p> : (
            <ul className="divide-y divide-line">
              {top.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/app/candidates/${c.id}`} className="min-w-0"><div className="truncate text-sm font-medium">{c.fullName}</div><div className="muted truncate text-xs">{c.currentTitle} {c.currentCompany && `· ${c.currentCompany}`}</div></Link>
                  <ScorePill score={c.fitScore} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="mb-3 flex items-center justify-between"><h2 className="h2">Recent runs</h2><Link href="/app/runs" className="muted underline">All</Link></div>
          {runs.length === 0 ? <p className="muted">Nothing has run yet.</p> : (
            <ul className="divide-y divide-line">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/app/runs/${r.id}`} className="min-w-0"><div className="text-sm font-medium">{r.type.replace("_", " ").toLowerCase()}</div><div className="muted text-xs">{fmtDate(r.createdAt)}</div></Link>
                  <StatusBadge s={r.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card lg:col-span-2">
          <h2 className="h2 mb-3">Upcoming interviews</h2>
          {interviews.length === 0 ? <p className="muted">No interviews scheduled.</p> : (
            <ul className="divide-y divide-line">
              {interviews.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <Link href={`/app/candidates/${i.candidateId}`} className="font-medium">{i.candidate.fullName}</Link>
                  <span className="muted">{fmtDate(i.startsAt)}</span>
                  {i.meetLink ? <a href={i.meetLink} className="underline" target="_blank" rel="noreferrer">Meet link</a> : <Badge>no link</Badge>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {candidates === 0 && <div className="mt-6"><Empty title="Start your first search">Create a role, then run a search. Scored candidates appear here.</Empty></div>}
    </>
  );
}
