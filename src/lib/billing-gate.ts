import type { Tenant } from "@prisma/client";

/** Product access is gated on subscription status (WS6). */
export function hasActiveAccess(t: Pick<Tenant, "subscriptionStatus" | "currentPeriodEnd">): boolean {
  if (t.subscriptionStatus === "ACTIVE") return true;
  // A trial ends on its date (in-app trials and Stripe trials both set currentPeriodEnd)
  if (t.subscriptionStatus === "TRIALING") return !t.currentPeriodEnd || t.currentPeriodEnd.getTime() > Date.now();
  // Past-due keeps a short grace window so a failed card doesn't kill a running search instantly.
  if (t.subscriptionStatus === "PAST_DUE") return !!t.currentPeriodEnd && t.currentPeriodEnd.getTime() + 3 * 864e5 > Date.now();
  return false;
}
export const PRICING = { setupCents: 100_000, monthlyCents: 150_000, currency: "usd" };
