import type { TenantKind } from "@prisma/client";

/**
 * Plan catalogue (scope §2 market model, WS1 roles, WS6 "room for solo-recruiter and white-label tiers").
 * STANDARD is the price in the scope document. The scope gives NO prices for SOLO / WHITELABEL, so those are set by
 * environment variables and the tier shows "contact us" until the business decides. We do not invent prices.
 */
export type Plan = {
  kind: TenantKind;
  name: string;
  tagline: string;
  setupCents: number | null;
  monthlyCents: number | null;
  features: string[];
};

const env = (k: string) => {
  const v = process.env[k];
  return v && /^\d+$/.test(v) ? Number(v) : null;
};

export function getPlans(): Record<TenantKind, Plan> {
  return {
    STANDARD: {
      kind: "STANDARD", name: "Employer / team", tagline: "For employers and in-house hiring teams",
      setupCents: 100_000, monthlyCents: 150_000,
      features: ["Unlimited searches, scoring and briefs", "Email, SMS and LinkedIn outreach with approval gate", "Inbox watch and interview scheduling", "Team seats and a private database"],
    },
    SOLO: {
      kind: "SOLO", name: "Solo recruiter", tagline: "Licensed to an individual recruiter",
      setupCents: env("PRICE_SOLO_SETUP_CENTS"), monthlyCents: env("PRICE_SOLO_MONTHLY_CENTS"),
      features: ["Everything in Employer", "Single seat", "Your own sender identity and integrations"],
    },
    WHITELABEL: {
      kind: "WHITELABEL", name: "Search firm (white-label)", tagline: "Your brand on the platform, for your clients",
      setupCents: env("PRICE_WHITELABEL_SETUP_CENTS"), monthlyCents: env("PRICE_WHITELABEL_MONTHLY_CENTS"),
      features: ["Everything in Employer", "Your name, colour and logo throughout the app and exported documents", "Underlying scoring logic stays private"],
    },
  };
}

export const planFor = (kind: TenantKind) => getPlans()[kind];
export const isPriced = (p: Plan) => p.monthlyCents != null && p.setupCents != null;
export const money = (c: number | null) => (c == null ? null : `$${(c / 100).toLocaleString("en-US")}`);
