import Link from "next/link";
import { ArrowRight, CalendarCheck, Check, Cloud, Inbox, MonitorSmartphone, Search, ShieldCheck, Send, Sparkles, Target } from "lucide-react";
import { getContext } from "@/lib/auth";
import { getPlans, isPriced, money } from "@/lib/plans";

const features = [
  [Search, "Source", "Find candidates on LinkedIn Recruiter and Indeed from your own signed-in browser, plus Apollo and web search."],
  [Sparkles, "Score and brief", "Every candidate is scored against your must-haves, with a rationale and a client-ready deep-dive brief."],
  [Send, "Reach out", "Draft email, SMS and InMail in a human voice. Nothing sends until a recruiter approves it."],
  [Inbox, "Inbox watch", "Replies are classified, labelled and answered with safe drafts. Opt-outs are honoured automatically."],
  [CalendarCheck, "Schedule", "Book interviews on Google Calendar with a Meet link, logged against the candidate."],
  [Target, "Win clients", "Prospect target companies, enrich contacts and draft intro emails for business development."],
] as const;

export default async function Home() {
  const ctx = await getContext();
  const plans = Object.values(getPlans());
  return (
    <main className="hero-bg relative min-h-screen overflow-hidden">
      <div className="grid-lines pointer-events-none absolute inset-x-0 top-0 h-[34rem]" aria-hidden />
      <header className="sticky top-0 z-20 px-3 pt-3">
        <div className="glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-2.5">
          <span className="text-lg font-bold">RecruitGPT<span className="text-brand">.ai</span></span>
          <nav className="flex items-center gap-2 text-sm" aria-label="Site">
            <a href="#how" className="hidden rounded-lg px-3 py-2 hover:bg-white/5 sm:inline">How it works</a>
            <a href="#pricing" className="hidden rounded-lg px-3 py-2 hover:bg-white/5 sm:inline">Pricing</a>
            {ctx ? <Link href="/app" className="btn btn-primary">Open app</Link> : <><Link href="/login" className="btn">Sign in</Link><Link href="/signup" className="btn btn-primary">Get started</Link></>}
          </nav>
        </div>
      </header>

      <section className="relative mx-auto max-w-4xl px-5 pb-16 pt-24 text-center">
        <p className="glass mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium"><ShieldCheck size={16} className="text-brand" aria-hidden /> A human approves every message</p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">Your AI recruiting team, <span className="gradient-text">with a human in charge.</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-muted sm:text-lg">
          RecruitGPT sources, scores and reaches the right candidates for you. Employers and in-house teams run their own searches, self-serve, and secure their own interviews.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn btn-accent min-h-12 px-6 text-base">Start now <ArrowRight size={18} aria-hidden /></Link>
          <a href="#how" className="btn glass min-h-12 px-6 text-base">See how it works</a>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Features">
        {features.map(([Icon, t, d]) => (
          <div key={t} className="card transition duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_16px_40px_-18px_rgba(91,140,255,0.5)]">
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand"><Icon size={20} aria-hidden /></span>
            <h3 className="h2">{t}</h3>
            <p className="muted mt-2">{d}</p>
          </div>
        ))}
      </section>

      <section id="how" className="mx-auto mt-24 max-w-5xl px-5">
        <h2 className="text-center text-3xl font-bold tracking-tight">Cloud brain, local hands</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
          LinkedIn and Indeed work best from a real, warm, logged-in browser on a normal connection. So the intelligence lives online and a small helper on your computer does the clicking.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="card">
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand"><Cloud size={20} aria-hidden /></span>
            <h3 className="h2">In the cloud</h3>
            <ul className="muted mt-2 list-disc space-y-1 pl-5">
              <li>Accounts, billing, your private candidate database</li>
              <li>Scoring, briefs and outreach drafting</li>
              <li>Email, SMS, calendar and data integrations</li>
              <li>Every message logged: what we said, to whom, when</li>
            </ul>
          </div>
          <div className="card">
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-accent/15 text-accent"><MonitorSmartphone size={20} aria-hidden /></span>
            <h3 className="h2">On your computer</h3>
            <ul className="muted mt-2 list-disc space-y-1 pl-5">
              <li>A thin helper that drives your own signed-in browser</li>
              <li>Receives only generic browser steps, nothing proprietary</li>
              <li>Stops and asks you if a site shows a verification</li>
              <li>Paced and rate-limited to protect your accounts</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto mt-24 max-w-6xl px-5">
        <h2 className="text-center text-3xl font-bold tracking-tight">Simple pricing</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((p, idx) => (
            <div key={p.kind} className={`card flex flex-col ${idx === 0 ? "border-brand/50 shadow-[0_20px_60px_-24px_rgba(91,140,255,0.5)]" : ""}`}>
              {idx === 0 && <span className="badge mb-3 w-fit border-brand/40 text-brand">Most popular</span>}
              <h3 className="h2">{p.name}</h3>
              <p className="muted">{p.tagline}</p>
              {isPriced(p) ? (
                <div className="mt-4"><span className="text-4xl font-extrabold">{money(p.monthlyCents)}</span><span className="text-sm text-muted"> / month</span><p className="muted mt-1">plus one-time {money(p.setupCents)} setup. Cancel anytime.</p></div>
              ) : (
                <div className="mt-4"><span className="text-3xl font-extrabold">Let&apos;s talk</span><p className="muted mt-1">Custom pricing for this plan.</p></div>
              )}
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((x) => <li key={x} className="flex gap-2"><Check size={18} className="mt-0.5 shrink-0 text-ok" aria-hidden />{x}</li>)}
              </ul>
              <Link href="/signup" className={`btn mt-6 min-h-11 ${idx === 0 ? "btn-accent" : ""}`}>{isPriced(p) ? "Create your workspace" : "Get started"}</Link>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted">Want a recruiter to run the search for you? Expert Recruiting&apos;s human-led Talent Search is available alongside the platform.</p>
      </section>

      <footer className="mx-auto mt-24 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-8 text-sm text-muted">
        <span>© Expert Recruiting. RecruitGPT.ai</span>
        <span className="flex gap-4"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/compliance">Platform compliance</Link></span>
      </footer>
    </main>
  );
}
