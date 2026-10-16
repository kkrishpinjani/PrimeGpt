# Architecture

## The three layers (scope §4)

| Layer | Where | How |
|---|---|---|
| **Data** | MySQL, one schema, `tenantId` on every business row | `prisma/schema.prisma`; access only through `tdb(tenantId)` |
| **Brain** | Server-side only | `src/lib/brain/*`; jobs in `worker/jobs/*`; one platform-owned AI key, metered per tenant |
| **Hands** | Customer's computer | `executor/`: generic primitives via a paired, authenticated WebSocket |

## Processes

1. **Web (Next.js, Vercel-style).** Renders UI, handles auth/billing/webhooks, and *only enqueues* `Run` rows. It never runs long jobs.
2. **Worker (persistent host).** Polls `Run` (atomic claim `QUEUED → RUNNING`), executes jobs, hosts the executor gateway (`:8009/executor`). Stale `RUNNING` jobs are requeued; **sends are never auto-retried** (non-idempotent).
3. **Local helper.** Dials *out* to the gateway (no port-forwarding), runs primitives against the customer's own Chrome via CDP.

## Tenant isolation (WS1)

MySQL has no row-level security, so isolation is enforced in `src/lib/tenant-db.ts`: a Prisma client extension injects `tenantId` into every `where`/`create` for tenant-owned models and strips attempts to change `tenantId`. App code gets this client from `getContext().db`. `tests/isolation.test.ts` is the isolation gate (reads, cross-tenant update/delete, tenant hopping, creates). Rule: never use bare `prisma` for tenant-owned models in request paths (worker jobs use it but always filter by `run.tenantId`).

## Approval gate and send choke point

`DRAFT → APPROVED` happens only in `approveAndSend` (a recruiter action, recorded with approver + timestamp). The worker's `runSend` (`worker/jobs/send.ts`) is the single place any message leaves, and enforces in order: status is APPROVED with an approval record → subscription active → do-not-contact (re-checked) → per-channel daily caps (LinkedIn 25 / email 150 / SMS 100) → send → event log. Inbound suggested replies are saved as drafts, never auto-sent. `tests/approval-gate.test.ts` covers it.

## IP boundary (WS7)

- `src/lib/protocol.ts` defines the only frames the cloud can send: `navigate/click/type/press/read/readAll/scroll/wait/url/screenshot/detect_challenge`. Strings are length-capped; unknown ops/keys are rejected or stripped; `navigate` is https + LinkedIn/Indeed hosts only (enforced in the cloud *and* the executor).
- Site knowledge (URLs, selectors) lives in the cloud (`worker/drivers/browser-sources.ts`) so it can be hot-fixed without shipping a new helper.
- Prompts/rubrics/voice rules live in `src/lib/brain/prompts.ts`. `tests/ip-boundary.test.ts` asserts the executor contains none of that text, doesn't import the brain or reference the AI provider, and that no client component imports brain code.
- White-label: per-tenant brand name/colour/logo applied in the UI; the underlying logic is never exposed.

## Browser automation safety (WS5)

Human-in-the-loop by design: if the helper's `detect_challenge` finds a CAPTCHA/verification/login wall, the run goes `NEEDS_HUMAN`, the UI tells the user, and the worker waits (up to 10 min) for them to clear it in their own browser. It never attempts to solve or bypass. The helper paces navigations (3.5–8.5 s jitter), caps 40 navigations/10 min and 600 actions/hour.

## Billing (WS6)

Stripe Checkout (subscription mode) with a one-time setup line item ($1,000) plus recurring ($1,500/mo). Idempotent webhook (`StripeEvent`) maintains `Tenant.subscriptionStatus`. Access is gated everywhere via `hasActiveAccess` (past-due gets a 3-day grace). Usage (`UsageEvent`) records AI tokens/cost, sourcing runs, InMail/SMS/email per tenant; AI spend has a per-tenant monthly budget cap.

## Integrations (WS8)

Per-tenant, server-side. Gmail + Calendar via OAuth (refresh token encrypted with AES-256-GCM). Quo/OpenPhone via tenant API key (inbound via webhook `/api/webhooks/quo/<token>` or polling). Apollo and Exa: platform key by default, bring-your-own key overrides. All sends are logged in `Message`: the single source of truth for "what did we say to whom".

## Two apps, one system

CandidateGPT.ai stays a separate product. A signed server-to-server endpoint (`/api/partner/candidategpt`, HMAC with `PARTNER_SHARED_SECRET`, requires `consentToShare`) lets it hand an opted-in job seeker to a RecruitGPT workspace. Sharing the auth/datastore with CandidateGPT later is a deployment decision, not a code change.
