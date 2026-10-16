import { prisma } from "@/lib/db";
import { mapStatus, stripe } from "@/lib/stripe";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig ?? "", process.env.STRIPE_WEBHOOK_SECRET ?? "");
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  // Idempotency: Stripe retries deliveries.
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch {
    return Response.json({ duplicate: true });
  }

  const obj: any = event.data.object;
  const tenantByCustomer = (id: string) => prisma.tenant.findFirst({ where: { stripeCustomerId: id } });

  switch (event.type) {
    case "checkout.session.completed": {
      const tenantId = obj.client_reference_id ?? obj.metadata?.tenantId;
      if (!tenantId) break;
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          stripeCustomerId: obj.customer,
          stripeSubscriptionId: obj.subscription ?? undefined,
          setupFeePaid: obj.payment_status === "paid" ? true : undefined,
          subscriptionStatus: "ACTIVE",
        },
      });
      await audit("billing.checkout_completed", { tenantId });
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const t = await tenantByCustomer(obj.customer);
      if (!t) break;
      const end = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end;
      await prisma.tenant.update({
        where: { id: t.id },
        data: {
          stripeSubscriptionId: obj.id,
          subscriptionStatus: event.type === "customer.subscription.deleted" ? "CANCELED" : mapStatus(obj.status),
          currentPeriodEnd: end ? new Date(end * 1000) : undefined,
        },
      });
      break;
    }
    case "invoice.payment_failed": {
      const t = await tenantByCustomer(obj.customer);
      if (t) await prisma.tenant.update({ where: { id: t.id }, data: { subscriptionStatus: "PAST_DUE" } });
      break;
    }
    case "invoice.paid": {
      const t = await tenantByCustomer(obj.customer);
      if (t && t.subscriptionStatus === "PAST_DUE") {
        await prisma.tenant.update({ where: { id: t.id }, data: { subscriptionStatus: "ACTIVE" } });
      }
      break;
    }
  }
  return Response.json({ received: true });
}
