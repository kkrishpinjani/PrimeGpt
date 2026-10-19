"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { checkoutLineItems, stripe, stripeConfigured } from "@/lib/stripe";
import { audit } from "@/lib/audit";

export async function startCheckout() {
  const ctx = await requireCtx({ minRole: "OWNER" });
  if (!stripeConfigured()) redirect("/app/billing?error=stripe_not_configured");
  const base = process.env.APP_URL!;
  let customer = ctx.tenant.stripeCustomerId ?? undefined;
  if (!customer) {
    const c = await stripe().customers.create({ email: ctx.user.email, name: ctx.tenant.name, metadata: { tenantId: ctx.tenant.id } });
    customer = c.id;
    await prisma.tenant.update({ where: { id: ctx.tenant.id }, data: { stripeCustomerId: customer } });
  }
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: ctx.tenant.id,
    line_items: checkoutLineItems(ctx.tenant.kind),
    subscription_data: { metadata: { tenantId: ctx.tenant.id } },
    success_url: `${base}/app/billing?success=1`,
    cancel_url: `${base}/app/billing?canceled=1`,
    allow_promotion_codes: true,
  });
  redirect(session.url!);
}

export async function openPortal() {
  const ctx = await requireCtx({ minRole: "OWNER" });
  if (!stripeConfigured() || !ctx.tenant.stripeCustomerId) redirect("/app/billing?error=no_customer");
  const s = await stripe().billingPortal.sessions.create({
    customer: ctx.tenant.stripeCustomerId!,
    return_url: `${process.env.APP_URL}/app/billing`,
  });
  redirect(s.url);
}

/**
 * Free trial (scope WS6 "trial/onboarding"). Length is a business decision, so it is configured by TRIAL_DAYS and
 * the feature is off when unset/0. One trial per workspace; it ends on its date and access is gated like any other status.
 */
export async function startTrial() {
  const ctx = await requireCtx({ minRole: "OWNER" });
  const days = Number(process.env.TRIAL_DAYS ?? 0);
  if (!(days > 0)) throw new Error("Trials are not offered");
  if (ctx.tenant.trialUsed || ctx.tenant.subscriptionStatus !== "NONE") redirect("/app/billing?error=trial_unavailable");
  await prisma.tenant.update({ where: { id: ctx.tenant.id }, data: { subscriptionStatus: "TRIALING", trialUsed: true, currentPeriodEnd: new Date(Date.now() + days * 86_400_000) } });
  await audit("billing.trial_started", { tenantId: ctx.tenant.id, userId: ctx.user.id, detail: `${days}d` });
  redirect("/app/billing?trial=1");
}

/** Local development only, and only when Stripe is not configured. Never available in production. */
export async function activateDemoSubscription() {
  const ctx = await requireCtx({ minRole: "OWNER" });
  if (process.env.NODE_ENV === "production" || stripeConfigured()) throw new Error("Not available");
  await prisma.tenant.update({
    where: { id: ctx.tenant.id },
    data: { subscriptionStatus: "ACTIVE", setupFeePaid: true, currentPeriodEnd: new Date(Date.now() + 30 * 864e5) },
  });
  await audit("billing.demo_activated", { tenantId: ctx.tenant.id, userId: ctx.user.id });
  redirect("/app/billing?success=1");
}
