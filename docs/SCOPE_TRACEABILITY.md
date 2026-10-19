# Scope traceability

Maps every section of *RecruitGPT.ai: Platform Transfer & Launch Scope* (13 pp., Aug 5 2026) to the implementation.

**Status key:** ✅ built and verified here (tests / running app) · 🟡 built to the vendor's API spec but **not verified against the live service** (needs credentials/accounts) · ⬜ not built (listed under Known gaps).

We were not given Carlos's repositories, skills or database, so the recruiting logic (scoring rubric, brief template, voice rules, classifier) is **our own implementation of the behaviours described in §3.2 and WS4**, not a port of his prompts.

## §1–2 Executive summary & business context

| Item | Status | Where |
|---|---|---|
| RecruitGPT.ai as self-serve online product (login, accounts, billing) | ✅ | `src/app`, `src/lib/auth.ts`, billing |
| Price: $1,000 setup + $1,500/mo, cancel anytime | ✅ code · 🟡 live Stripe | `src/lib/billing-gate.ts` `PRICING`, `src/lib/stripe.ts`, landing page |
| Employers/recruiters source & secure their own interviews, self-serve | ✅ | Searches → Candidates → Outreach → Interviews |
| "Two applications, one system" (separate sister apps, connected behind the scenes) | ✅ | Separate app + signed partner endpoint `src/app/api/partner/candidategpt` |
| Talent Search / CandidateGPT / Career Coaching offerings | n/a | Other products. Talent Search referenced on the landing page; CandidateGPT integration via partner endpoint |
| B2B core; solo-recruiter & white-label as expansion | 🟡 | `Tenant.kind` (STANDARD/SOLO/WHITELABEL) + per-tenant branding built; no separate pricing/self-provisioning flow (⬜ see gaps) |
| Revenue shift targets (30%→75% platform) | n/a | Business plan, not a feature |

## §3 Current state: features of the engine (3.2) → implementation

| Engine capability | Status | Where |
|---|---|---|
| Source via LinkedIn Recruiter & Indeed Smart Sourcing in a live browser; read profiles; score fit; save structured records | ✅ flow (tested with a fake browser) · 🟡 live selectors | `worker/drivers/browser-sources.ts`, `worker/jobs/sourcing.ts` |
| Matches & briefs: rank shortlist, deep-dive briefs, client-ready Word/Excel | ✅ | `src/lib/brain/{scoring,brief}.ts`, `src/lib/services/documents.ts` (.docx brief, .xlsx shortlist/compare), `/api/documents` |
| Outreach: draft & (on approval) send InMail, email, SMS, follow-ups; every send approval-gated | ✅ gate · 🟡 live channels | `src/lib/brain/outreach.ts`, `actions/outreach.ts`, `worker/jobs/send.ts` |
| Inbox watch: poll SMS+email, classify & label replies, draft safe responses | ✅ logic · 🟡 live Gmail/Quo | `worker/jobs/inbox.ts`, `src/lib/services/inbound.ts`, `src/lib/brain/inbox.ts`, Quo webhook |
| Scheduling: book candidate/client interviews on Google Calendar with Meet links, log them | ✅ logged · 🟡 live Calendar | `scheduleInterview` action, `google.ts#createMeetEvent`, Interviews page |
| Client acquisition: prospect companies (Apollo + web search), enrich contacts, outreach lists | ✅ logic · 🟡 live Apollo/Exa | `worker/jobs/misc.ts#runProspecting`, `src/lib/brain/prospect.ts`, Prospects page |
| Data: candidates, contacts, clients, job orders, message log, saved searches, run history | ✅ | `prisma/schema.prisma` |
| Scheduled tasks (mostly disabled; only inbox poll autonomous) | ✅ | Opt-in per tenant; worker scheduler + Vercel cron backup |

§3.1 (CandidateGPT near-launch app) is the *reference build*; its stack (Next.js/Supabase/Stripe/Vercel/Sentry) is mirrored here with **MySQL replacing Supabase Postgres** per the client's instruction. Its naming caveat (`recruitgptapp/` folder) does not apply to this fresh repo.

## §4 Core challenge: data / brain / hands

| Layer | Status |
|---|---|
| Data → multi-tenant (per-row tenant key) | ✅ |
| Brain → cloud services, IP kept off customer machines | ✅ server-side only, enforced by tests |
| Hands → thin local executor, generic primitives only | ✅ end-to-end (pairing → gateway → primitives) · 🟡 against real sites |

## §5 Workstreams

**WS1 Platform foundation & multi-tenancy**
- Separate app on its own domain, shared infra pattern, not fused: ✅ (separate app; partner API)
- Accounts, workspaces, roles (owner/admin/recruiter/viewer): ✅ + invites (email via SMTP if configured, else link)
- Per-tenant isolation as first-class + isolation gate: ✅ `tests/isolation.test.ts`

**WS2 Data model & migration**
- Multi-tenant tables with tenant key: ✅
- One-time migration of existing data (Carlos = tenant #1): ✅ script + dry-run, 🟡 mappings must be confirmed against his actual SQLite schema (`scripts/import-sqlite.ts`); CSV import in UI also works
- Port full-text candidate search: ✅ MySQL FULLTEXT, tenant-scoped (tested)
- Retire legacy pre-2026 tables: ✅ importer skips them

**WS3 Self-serve web UI**
- Start sourcing run, watch progress, review scored candidates tagged new/saved: ✅ (live progress page; statuses)
- Briefs, notes, reject/save, side-by-side compare: ✅
- Outreach composer with approval gate across email/SMS/LinkedIn: ✅
- Pipeline/dashboard, saved searches, message threads per contact: ✅ (thread history on candidate page)
- Client & job-order management and document generation: ✅

**WS4 Agent/orchestration layer**
- Persistent worker host (not Vercel functions): ✅ `worker/`, `Dockerfile.worker`
- Skills ported to callable cloud services / tools: ✅ sourcing, scoring, brief, outreach, follow-up, inbox classification, prospecting
- Central platform-owned AI key, metered per tenant, monthly budget cap: ✅ `src/lib/brain/claude.ts` · 🟡 live Claude (no key supplied)
- Preserve business rules: voice/tone ✅, approval gating ✅, comp-disclosure branching ✅, do-not-contact ✅ (draft + send time)
- Job/queue model, background + report back, retries/recovery: ✅ (sends never auto-retried by design)

**WS5 Local-hands executor**
- Thin executor, generic primitives, no IP on device: ✅ `executor/`
- Secure channel: auth ✅ (device token, SHA-256 at rest), encryption ✅ via `wss://` in production (TLS at proxy), session pairing ✅ (one-time 15-min codes), reconnect ✅ (exp. backoff), revoke ✅
- Session warmth & residential IP: ✅ design (user's own Chrome profile, own connection) · 🟡 must be validated live (Phase 1 risk) · ⬜ managed residential sessions
- Anti-bot: detect CAPTCHA/verification → surface to human, never bypass ✅ (`NEEDS_HUMAN` state), human-in-the-loop ✅, rate limiting ✅ (local + daily caps)
- Package for non-technical customers: 🟡 PowerShell installer + scheduled task; ⬜ signed installer/auto-update

**WS6 Billing & subscriptions**
- Stripe setup fee + monthly; cancel anytime: ✅ code · 🟡 live keys
- Lifecycle trial/active/past-due/cancel; gate access: ✅ (`hasActiveAccess`, grace window, webhook sync, portal)
- Tie usage (runs, InMail, AI spend) to tenant: ✅ `UsageEvent`, Billing page · metered Stripe add-ons ⬜ (usage tracked, not yet invoiced)

**WS7 IP protection**
- Only generic primitives cross: ✅ schema-enforced both sides + tests
- Central key & prompt storage server-side; no skill text to clients: ✅ tests assert it
- White-label per-tenant branding without exposing logic: ✅ brand name/colour/logo

**WS8 Integrations**
- Per-tenant server-side credentials/OAuth: ✅ AES-256-GCM store · 🟡 live OAuth
- Gmail, Quo/OpenPhone, Google Calendar, Apollo, Exa: ✅ code · 🟡 live
- Approval gate + message/event log as source of truth: ✅ `Message`
- Platform-provided vs BYO: ✅ decision implemented: Apollo/Exa platform default with BYO override; email/phone/calendar/LinkedIn seat BYO

**WS9 Launch infrastructure, security & compliance**
- Domain/DNS, SMTP, secrets: ✅ env-driven, SMTP mailer for invites; `docs/OPERATIONS.md` checklist · DNS/cutover is deployment work
- Credential hygiene: ✅ no secrets in code/`.env.example`; `.env` git-ignored; rotation procedure documented
- Monitoring, error tracking, backups, rate limiting: ✅ Sentry hook, `/api/health`, `npm run backup`, DB rate limiter on auth/pairing
- Legal & compliance incl. explicit LinkedIn/Indeed position: ✅ `/terms`, `/privacy`, `/compliance` (drafts: **need counsel review**)
- Security headers, hashed passwords (bcrypt 12), audit log: ✅

## §6 Recommended architecture: all components present (web, shared datastore, auth, billing, persistent orchestration, local executor, per-tenant integrations).

## §7 Phasing

| Phase | Status |
|---|---|
| 0 Discovery & access; rotate secrets | Procedure documented; no client access was provided |
| 1 Single-tenant online + prove cloud-brain/local-hands | Code complete; **live proof against LinkedIn/Indeed pending** |
| 2 Multi-tenant self-serve + billing | Code complete (accounts, isolation, Stripe, per-tenant integrations, full recruiter UI) |
| 3 Scale & white-label | Partial: branding, solo/white-label `kind`; ⬜ managed residential sessions, solo/white-label pricing & provisioning |

## §8 Decisions (defaults chosen; all reversible)

Separate app + shared-infra pattern ✅ · integrations platform-provided for Apollo/Exa, BYO for email/phone/calendar/LinkedIn ✅ · self-hosted helper first ✅ · AI cost absorbed within a per-tenant monthly budget ✅ (usage tracked for a future pass-through) · autonomy opt-in, on-demand by default ✅.

Risks addressed in design: ToS (human-in-loop, no bypass, caps, compliance page) · session fragility (validate first) · credential exposure (rotation, encrypted store) · IP leakage (schema + tests).

## §9 What the developer receives: n/a (inbound). §10 Open questions: answered in the proposal (approach to local hands = outbound-WS executor over the user's own Chrome; separate app; phasing above).

## Phase 3 and remaining WS items (added after the first build)

| Scope item | Status | Where |
|---|---|---|
| WS5 Package the local component for non-technical customers | ✅ built and tested (pairing, bundle, self-update with checksum, clean restart) · 🟡 not tried on a clean Windows machine | `GET /api/executor/installer` (personalised one-click `.cmd`), `scripts/build-helper.mjs` → `public/helper/*`, auto-update in `executor/src/index.ts` |
| WS5/Phase 3 Managed residential sessions | 🟡 built, unverified: hosted helper image with residential-proxy + noVNC sign-in; request flow and admin provisioning | `Dockerfile.helper`, `docker/managed-entrypoint.sh`, Integrations page, `/app/admin` |
| WS1/WS6 Solo-recruiter & white-label tiers | ✅ account types at signup, per-plan checkout, plan switching by operator, landing page plans · prices for these tiers are NOT in the scope document, so they are env-configured (`PRICE_SOLO_*`, `PRICE_WHITELABEL_*`) and show "Let's talk" until set | `src/lib/plans.ts`, `/app/admin` |
| Platform operator console | ✅ | `/app/admin`, `npm run make-admin -- <email>` |
| Phase 3 autonomy: scheduled follow-ups | ✅ opt-in; drafts only, never sent without approval; capped; idempotent (tested) | `worker/jobs/followups.ts`, Settings, Outreach "Draft follow-ups now" |
| WS6 Metered add-ons if AI usage is passed through | ✅ off by default; per-workspace switch; monthly cron adds invoice items; idempotent (tested with a stubbed Stripe) · 🟡 live Stripe · rates not in scope doc, env-configured (`USAGE_*`) | `src/lib/usage-billing.ts`, `/api/cron/usage-billing` |
| WS2 One-time migration (Carlos = tenant #1) | ✅ tested end to end against a synthetic SQLite database (dry-run, relinking, legacy tables skipped) · 🟡 column names must be confirmed against his real database | `scripts/import-sqlite.ts`, `tests/phase3.test.ts` |

## Audit pass: items found missing on a line-by-line re-read, now built

| Scope item | Status | Where |
|---|---|---|
| §3.2 / WS2 "ranks a shortlist from the local database": match a role against the whole talent pool | ✅ tested | Role page → "Match from my database"; `worker/jobs/match.ts`; `JobMatch` |
| §3.2 run history; portal shell "runs" | ✅ | `/app/runs` (filters), dashboard link |
| WS3 contacts, "message threads per contact" | ✅ | `/app/contacts`, `/app/contacts/[id]`, `/app/clients/[id]` (edit client, contacts, roles) |
| §3.2 client acquisition: Apollo **+ web search**, enrich contacts | ✅ tested with stubbed APIs · 🟡 live | Prospects: "Target companies" (Exa) then "Find contact" (Apollo enrichment) |
| WS9 data handling; privacy-page promises: edit/erase a candidate, export data, delete workspace | ✅ tested (erasure, CSV safety) | Candidate page (edit / erase), Settings → Your data, `/api/export/*` |
| WS6 trial/onboarding | ✅ (trial length is configuration: `TRIAL_DAYS`; off when unset) | Billing "Start trial", dashboard "Get started" checklist |
| WS5 "guide each customer to a reliable local setup" | ✅ | Integrations: live helper + browser status, step-by-step guide |
| WS9 rate limiting | ✅ tested | `src/middleware.ts` (per-IP, all routes), per-user limit, DB limiter on login/pairing, tighter limits on exports/installer |
| §2 "human services convert and upsell" | ✅ | `/app/expert-help` request form, operator inbox in Platform admin, optional email via `EXPERT_REQUESTS_EMAIL` |
| WS5 packaging for any customer machine | ✅ scripts syntax-checked · 🟡 not run on real Mac/Linux | Windows `.cmd`, macOS `.command`, Linux `.sh` |
| §10 open questions | ✅ | `docs/PROPOSAL_ANSWERS.md` |

## Known gaps / next steps

1. **Live validation** of everything marked 🟡: needs Anthropic, Stripe, Google OAuth, Quo, Apollo and Exa credentials; a licensed LinkedIn Recruiter/Indeed account for the helper; clean Windows/Mac/Linux machines for the installers; a residential-proxy provider for managed sessions.
2. **Counsel review** of `/terms`, `/privacy`, `/compliance`; Google sensitive-scope verification.
3. **Carlos's real recruiting logic**: scoring rubric, brief template, voice rules and classifier are our own implementation; the original ~13 skills and ~70 scripts were not available.
4. **Deployment**: domain/DNS, production SMTP, secrets in a vault, hosting accounts (checklist in `docs/OPERATIONS.md`).
5. **Business decisions**: solo / white-label prices, usage rates, trial length (all configuration).
6. **Deliberate deviations from the scope document**: MySQL instead of Postgres (owner's instruction); not reusing CandidateGPT's auth, Stripe and design system because that repository was not provided.
7. Not in the scope document, but expected of a real product: password reset and email verification.
