import { requireCtx } from "@/lib/auth";
import { fmtDate, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PRICING } from "@/lib/billing-gate";
import { stripeConfigured } from "@/lib/stripe";
import { activateDemoSubscription, openPortal, startCheckout } from "../actions/billing";
import { monthlyAiSpendCents } from "@/lib/brain/claude";

export const metadata = { title: "Billing" };
const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

export default async function Billing({ searchParams }: { searchParams: Promise<{ success?: string; canceled?: string; required?: string; error?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const t = ctx.tenant;
  const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
  const [spend, runs, inmail, sms, emails] = await Promise.all([
    monthlyAiSpendCents(t.id),
    ctx.db.usageEvent.count({ where: { kind: "sourcing_run", createdAt: { gte: since } } }),
    ctx.db.usageEvent.count({ where: { kind: "inmail", createdAt: { gte: since } } }),
    ctx.db.usageEvent.count({ where: { kind: "sms", createdAt: { gte: since } } }),
    ctx.db.usageEvent.count({ where: { kind: "email", createdAt: { gte: since } } }),
  ]);
  const demo = process.env.NODE_ENV !== "production" && !stripeConfigured();
  return (
    <>
      <PageHeader title="Billing" subtitle="Subscription and usage for this workspace." />
      {sp.success && <Notice tone="ok">Thanks. Your subscription is being activated.</Notice>}
      {sp.required && <Notice tone="warn">An active subscription is required for that feature.</Notice>}
      {sp.error === "stripe_not_configured" && <Notice tone="bad">Stripe is not configured on this server.</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between"><h2 className="h2">RecruitGPT.ai</h2><StatusBadge s={t.subscriptionStatus === "NONE" ? "inactive" : t.subscriptionStatus} /></div>
          <div className="mt-3 text-3xl font-semibold">{money(PRICING.monthlyCents)}<span className="text-sm font-normal text-muted"> / month</span></div>
          <p className="muted">plus one-time {money(PRICING.setupCents)} setup {t.setupFeePaid && "(paid)"}. Cancel anytime.</p>
          {t.currentPeriodEnd && <p className="muted mt-2 text-xs">Current period ends {fmtDate(t.currentPeriodEnd)}</p>}
          {ctx.role === "OWNER" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {!ctx.active && <form action={startCheckout}><SubmitButton className="btn-primary">Subscribe</SubmitButton></form>}
              {t.stripeCustomerId && <form action={openPortal}><SubmitButton>Manage billing</SubmitButton></form>}
              {demo && !ctx.active && <form action={activateDemoSubscription}><SubmitButton>Activate demo (dev only)</SubmitButton></form>}
            </div>
          ) : <p className="muted mt-4 text-xs">Only the workspace owner can change billing.</p>}
          {demo && <p className="muted mt-2 text-xs">Stripe is not configured, so a dev-only demo activation is available. It is disabled in production.</p>}
        </section>
        <section className="card">
          <h2 className="h2">Usage this month</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="muted">Sourcing runs</dt><dd className="text-xl font-semibold">{runs}</dd></div>
            <div><dt className="muted">InMail sent</dt><dd className="text-xl font-semibold">{inmail}</dd></div>
            <div><dt className="muted">Emails sent</dt><dd className="text-xl font-semibold">{emails}</dd></div>
            <div><dt className="muted">SMS sent</dt><dd className="text-xl font-semibold">{sms}</dd></div>
            <div className="col-span-2"><dt className="muted">AI spend (est.)</dt><dd className="text-xl font-semibold">${(spend / 100).toFixed(2)} <span className="muted text-xs font-normal">of ${(t.aiMonthlyBudgetCents / 100).toFixed(0)} budget</span></dd></div>
          </dl>
          <p className="muted mt-3 text-xs">AI cost is absorbed in the subscription and capped by the monthly budget. Usage is tracked per workspace for future usage-based pricing.</p>
        </section>
      </div>
    </>
  );
}
