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
    line_items: checkoutLineItems(),
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
