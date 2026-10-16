import Stripe from "stripe";
import type { SubStatus } from "@prisma/client";
import { PRICING } from "./billing-gate";

let s: Stripe | null = null;
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export const stripe = () => (s ??= new Stripe(process.env.STRIPE_SECRET_KEY!));

/** Setup fee (one-time) + monthly (recurring) in one Checkout. Uses configured Price IDs, else inline price_data. */
export function checkoutLineItems(): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const setup = process.env.STRIPE_PRICE_SETUP;
  const monthly = process.env.STRIPE_PRICE_MONTHLY;
  return [
    setup
      ? { price: setup, quantity: 1 }
      : { quantity: 1, price_data: { currency: PRICING.currency, unit_amount: PRICING.setupCents, product_data: { name: "RecruitGPT.ai setup" } } },
    monthly
      ? { price: monthly, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: PRICING.currency,
            unit_amount: PRICING.monthlyCents,
            recurring: { interval: "month" },
            product_data: { name: "RecruitGPT.ai subscription" },
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
