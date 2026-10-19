# Proposal answers: scope document §10

Answers to the five questions in *RecruitGPT.ai: Platform Transfer & Launch Scope*, §10. Written from what has actually been built and tested, and what has not.

## 1. Approach to the "local hands" browser problem (WS5)

**A thin local helper that dials out to the cloud and drives the customer's own signed-in Chrome.**

- The cloud brain (scoring, prompts, rules, integrations, data) never leaves our servers. The helper receives only generic browser primitives (navigate, click, type, press, read, scroll, wait, screenshot, detect-challenge). The wire protocol is schema-validated on both sides, strings are length-capped, and navigation is limited to https LinkedIn/Indeed hosts. A test asserts that no prompt text can cross the boundary.
- The helper connects **outbound** over WebSocket (no port forwarding, TLS in production), is paired once with a single-use code, authenticates with a long-lived token stored hashed, and reconnects automatically. Pairing, revocation and reconnect are built and tested end to end.
- **Session warmth and residential IP** are solved by design, not by infrastructure: the customer's own browser profile on their own connection. Delivery is a one-click installer (Windows, macOS, Linux) that registers autostart and **updates itself** with checksum verification.
- **Anti-bot reality:** the helper never solves or bypasses a CAPTCHA or verification. It reports it, the run pauses in a "needs human" state, and the person clears it in their own browser. Pacing is human-like and rate-limited locally; daily send caps apply per channel.
- **For customers who cannot run a helper:** a managed session (the same helper in a container behind a residential proxy, with a remote browser view for the one-time sign-in), requested in-app and provisioned by an operator. This is built but **not validated** and needs a proxy provider and a terms-of-service review.
- **What is not proven yet:** the LinkedIn Recruiter / Indeed page selectors. They are centralised in the cloud so they can be fixed without shipping a new helper, but they must be validated with a licensed account. This is the make-or-break item and should be Phase 1.

## 2. Separate app or module of the existing platform?

**Separate app, shared-infrastructure pattern.** It matches the business rule "two applications, one system" and the scope's own recommendation: separate domain and deployment, connected behind the scenes. We built it that way. A signed server-to-server endpoint lets CandidateGPT hand an opted-in job seeker to a RecruitGPT workspace without fusing the products. Consolidating later is a deployment decision, not a rewrite, because tenancy, auth and billing are already per-workspace.

Reasons: independent release cadence, independent failure domains (a helper outage must not touch the job-seeker app), different customers and pricing, and white-label needs a clean tenant boundary.

## 3. Estimate and phasing

Phase 1 and Phase 2 are **already built**; what remains is validation and launch work.

| Milestone | Remaining work | Estimate (AI-assisted team of 1 to 2) |
|---|---|---|
| **Phase 1: single-tenant online, prove cloud-brain + local-hands** | Connect real accounts (Claude, Stripe, Google, Quo, Apollo, Exa); validate LinkedIn/Indeed with a licensed account and fix selectors; import Carlos's data; tune scoring/outreach with his review | about 2 to 3 weeks |
| **Phase 2: first external paying customers** | Browser QA of every flow, security review, deployment (domain, TLS, staging, monitoring, backup drill), installer testing on clean machines, pilot with Carlos | about 1 to 2 further weeks, plus outside waits |
| **Phase 3: scale and white-label** | Largely built (tiers, white-label branding, managed sessions, follow-up automation, usage billing); needs live validation and the business decisions below | 1 to 2 weeks after Phase 2 |

Outside our control: Google's OAuth verification for email sending (2 to 6 weeks), counsel review of the legal pages (1 to 2 weeks), and how LinkedIn/Indeed behave in practice.

## 4. Team shape

A **small team, product-led**: one full-stack engineer who owns the platform end to end (this codebase is one repository, one stack) with AI-assisted development, plus a part-time product owner on Expert Recruiting's side (Carlos or a delegate) who owns decisions, supplies the real recruiting rules and reviews output quality. Add a second engineer for the Phase 1 helper validation and the managed-session work if parallelism matters. A lawyer and an account owner for the third-party services are needed but not full time.

Split: product/PM decides pricing, autonomy level, compliance stance and acceptance of AI output quality; engineering owns architecture, the helper, security, billing and operations.

## 5. What we would challenge in the current design

1. **LinkedIn/Indeed automation is a business risk, not just a technical one.** Even with a human in the loop and no bypassing, platform terms may restrict it. Get counsel's view before external customers, and consider API-based sourcing (Apollo, Exa, CSV, partner data) as a first-class path so the product does not depend on browser automation alone.
2. **Self-hosted helper adoption.** Non-technical customers abandon installs. The one-click installer helps; managed sessions may be needed for the mainstream segment, which changes unit economics (proxy and hosting cost per tenant).
3. **Flat $1,500/month with absorbed AI and sourcing cost.** Heavy users could be unprofitable. We built a per-tenant AI budget cap and optional usage pass-through; the pricing decision should be made deliberately.
4. **"No IP on the device" is strong but not absolute.** Scraped profile text flows back to the cloud and prompts shape what the helper is asked to read. That is acceptable, but model prompts should be treated as trade secrets protected contractually as well as technically.
5. **Isolation is enforced in the application layer** (a query wrapper plus tests), because MySQL has no row-level security. That is sound but depends on discipline; moving to Postgres with RLS would add defence in depth.
6. **MySQL instead of Postgres.** Built on MySQL at the owner's instruction. Everything used is portable, but sharing infrastructure with the sister app (which the scope assumes is Supabase/Postgres) would need either a second database or a port.
7. **Recruiting logic provenance.** The scoring rubric, brief template and voice rules in this build are a fresh implementation of the behaviours the scope describes, not a port of Carlos's ~13 skills and ~70 scripts. Those should be reviewed against the originals before launch.

## Decisions Carlos owns (scope §8) and the defaults we chose

| Decision | Default implemented |
|---|---|
| Separate app vs. module | Separate app, shared-infra pattern |
| Platform-provided vs. bring-your-own integrations | Apollo/Exa platform-provided with BYO override; email, calendar, phone and LinkedIn seat are the customer's own |
| Self-hosted helper vs. managed sessions | Self-hosted first; managed available on request |
| Pricing; absorb vs. pass through AI/sourcing cost | $1,000 setup + $1,500/month; costs absorbed within a per-tenant monthly budget; pass-through is a per-workspace switch. Solo/white-label prices and trial length are not in the scope document, so they are configuration (`PRICE_*`, `TRIAL_DAYS`) |
| Autonomous behaviour at launch | On-demand by default; scheduled inbox watch and follow-up drafting are opt-in per workspace, and nothing is ever sent without approval |
