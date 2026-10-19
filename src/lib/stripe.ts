import Stripe from "stripe";
import type { SubStatus } from "@prisma/client";
import type { TenantKind } from "@prisma/client";
import { isPriced, planFor } from "./plans";

let s: Stripe | null = null;
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export const stripe = () => (s ??= new Stripe(process.env.STRIPE_SECRET_KEY!));

/** Setup fee (one-time) + monthly (recurring) in one Checkout. Uses configured Price IDs, else inline price_data. */
export function checkoutLineItems(kind: TenantKind = "STANDARD"): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const plan = planFor(kind);
  if (!isPriced(plan)) throw new Error(`The ${plan.name} plan has no price configured yet`);
  // Pre-created Stripe Price IDs exist only for the standard plan; other plans use inline prices.
  const setup = kind === "STANDARD" ? process.env.STRIPE_PRICE_SETUP : undefined;
  const monthly = kind === "STANDARD" ? process.env.STRIPE_PRICE_MONTHLY : undefined;
  return [
    setup
      ? { price: setup, quantity: 1 }
      : { quantity: 1, price_data: { currency: "usd", unit_amount: plan.setupCents!, product_data: { name: `RecruitGPT.ai setup (${plan.name})` } } },
    monthly
      ? { price: monthly, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: plan.monthlyCents!,
            recurring: { interval: "month" },
            product_data: { name: `RecruitGPT.ai subscription (${plan.name})` },
          },
        },
  ];
}

export function mapStatus(s: string): SubStatus {
  switch (s) {
    case "active": return "ACTIVE";
    case "trialing": return "TRIALING";
    case "past_due":
    case "unpaid": return "PAST_DUE";
    case "canceled":
    case "incomplete_expired": return "CANCELED";
    default: return "NONE";
  }
}
