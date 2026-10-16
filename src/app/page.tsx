import Link from "next/link";
import { getContext } from "@/lib/auth";
import { PRICING } from "@/lib/billing-gate";

const features = [
  ["Source", "Find candidates on LinkedIn Recruiter and Indeed from your own signed-in browser, plus Apollo and web search."],
  ["Score and brief", "Every candidate is scored against your must-haves, with a rationale and a client-ready deep-dive brief."],
  ["Reach out", "Draft email, SMS and InMail in a human voice. Nothing sends until a recruiter approves it."],
  ["Inbox watch", "Replies are classified, labelled and answered with safe drafts. Opt-outs are honoured automatically."],
  ["Schedule", "Book interviews on Google Calendar with a Meet link, logged against the candidate."],
  ["Win clients", "Prospect target companies, enrich contacts and draft intro emails for business development."],
];

export default async function Home() {
  const ctx = await getContext();
  const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <span className="text-lg font-semibold">RecruitGPT<span className="text-brand">.ai</span></span>
        <nav className="flex items-center gap-3 text-sm">
          <a href="#how" className="hidden sm:inline">How it works</a>
          <a href="#pricing" className="hidden sm:inline">Pricing</a>
          {ctx ? <Link href="/app" className="btn btn-primary">Open app</Link> : <><Link href="/login" className="btn">Sign in</Link><Link href="/signup" className="btn btn-primary">Get started</Link></>}
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-20 text-center">
        <p className="badge mx-auto mb-5">By Expert Recruiting</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Your AI recruiting team, with a human in charge.</h1>
        <p className="muted mx-auto mt-5 max-w-2xl text-base">
          RecruitGPT sources, scores and reaches the right candidates for you. Employers and in-house teams run their own searches, self-serve, and secure their own interviews.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn btn-primary px-5 py-3">Start now</Link>
          <a href="#how" className="btn px-5 py-3">See how it works</a>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(([t, d]) => (
          <div key={t} className="card"><h3 className="h2">{t}</h3><p className="muted mt-2">{d}</p></div>
        ))}
      </section>

      <section id="how" className="mx-auto mt-20 max-w-5xl px-5">
        <h2 className="h1 text-center">Cloud brain, local hands</h2>
        <p className="muted mx-auto mt-3 max-w-2xl text-center">
          LinkedIn and Indeed work best from a real, warm, logged-in browser on a normal connection. So the intelligence lives online and a small helper on your computer does the clicking.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="card">
            <h3 className="h2">In the cloud</h3>
            <ul className="muted mt-2 list-disc space-y-1 pl-5">
              <li>Accounts, billing, your private candidate database</li>
              <li>Scoring, briefs and outreach drafting</li>
              <li>Email, SMS, calendar and data integrations</li>
              <li>Every message logged: what we said, to whom, when</li>
            </ul>
          </div>
          <div className="card">
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

      <section id="pricing" className="mx-auto mt-20 max-w-3xl px-5">
        <h2 className="h1 text-center">Simple pricing</h2>
        <div className="card mt-8 text-center">
          <div className="text-5xl font-semibold">{money(PRICING.monthlyCents)}<span className="text-base font-normal text-muted"> / month</span></div>
          <p className="muted mt-1">plus a one-time {money(PRICING.setupCents)} setup. Cancel anytime.</p>
          <ul className="muted mx-auto mt-6 max-w-sm space-y-1 text-left">
            <li>✓ Unlimited searches, scoring and briefs</li>
            <li>✓ Email, SMS and LinkedIn outreach with approval gate</li>
            <li>✓ Inbox watch and interview scheduling</li>
            <li>✓ Team seats and your own private database</li>
          </ul>
          <Link href="/signup" className="btn btn-primary mt-6 px-6 py-3">Create your workspace</Link>
        </div>
        <p className="muted mt-4 text-center text-xs">Want a recruiter to run the search for you? Expert Recruiting&apos;s human-led Talent Search is available alongside the platform.</p>
      </section>

      <footer className="mx-auto mt-24 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-8 text-sm text-muted">
        <span>© Expert Recruiting. RecruitGPT.ai</span>
        <span className="flex gap-4"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/compliance">Platform compliance</Link></span>
      </footer>
    </main>
  );
}
