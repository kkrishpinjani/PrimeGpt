# Operations & launch checklist (WS9)

## Environments

| Component | Host | Notes |
|---|---|---|
| Web | Vercel (or any Node host): `npm run build && npm start` | Needs MySQL reachable (PlanetScale/RDS/Aiven/Cloud SQL). `vercel.json` registers the inbox cron. |
| Worker | Fly.io / Railway / VPS: `Dockerfile.worker` | Long-lived. Expose `:8009` behind TLS so helpers use `wss://`. Run **one or more** instances; the claim is atomic. |
| DB | MySQL 8, utf8mb4 | Enable automated backups + PITR at the provider. FULLTEXT index is created by `prisma db push`. |

## Environment variables

See `.env.example`. Required: `DATABASE_URL`, `APP_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` (32-byte hex; **losing it makes stored integration secrets unreadable**; back it up in a secrets manager), `GATEWAY_PUBLIC_URL`, `GATEWAY_PORT`. Feature keys: `ANTHROPIC_API_KEY`, `STRIPE_*`, `GOOGLE_CLIENT_ID/SECRET`, `APOLLO_API_KEY`, `EXA_API_KEY`, `SENTRY_DSN`, `CRON_SECRET`, `PARTNER_SHARED_SECRET`. Web and worker must share `DATABASE_URL`, `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, integration keys.

## Go-live checklist

- [ ] Fresh production secrets (never reuse dev). **Rotate** any credential that ever existed in plaintext; never hand a raw `.env` to a contractor, use the host's secret store.
- [ ] Domain + DNS for `recruitgpt.ai` (web) and `hands.recruitgpt.ai` (worker gateway, TLS).
- [ ] Production SMTP (`SMTP_*`) for system email.
- [ ] Stripe live keys; create webhook → `https://recruitgpt.ai/api/webhooks/stripe` (events: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`); set `STRIPE_WEBHOOK_SECRET`. Test a $1,500/mo + $1,000 setup checkout end to end in test mode first.
- [ ] Google Cloud OAuth app (Gmail send/readonly/modify + Calendar events); redirect URI `https://recruitgpt.ai/api/integrations/google/callback`; complete Google's sensitive-scope verification (needed for >100 users).
- [ ] Anthropic key with a spend limit; tune `AI_PRICE_*` envs to the real model price.
- [ ] `npm run db:push` on production DB; **do not** run `db:seed`.
- [ ] Sentry DSN set; alert on worker `FAILED` run rate.
- [ ] Backups: provider PITR + `npm run backup` (mysqldump) on a schedule, copied off-box; **do a restore drill**.
- [ ] Counsel review of `/terms`, `/privacy`, `/compliance`.
- [ ] Run `npm test` against a staging DB (isolation + approval gates must pass).
- [ ] Validate the local helper against live LinkedIn/Indeed (see LOCAL_HELPER.md) before onboarding external customers.

## Monitoring

`GET /api/health` (DB check) for uptime probes. Errors → Sentry. Operational data in-app: Runs (status/events), Billing (usage), Settings → audit log. Rate limiting: auth (10/10 min/IP), executor pairing (10/10 min/IP) in MySQL (`RateLimit`); add a CDN/WAF rate limit in front for general traffic.

## Runbook

- **Run stuck `RUNNING`:** worker requeues after 15 min (sends are failed, not requeued, to avoid duplicates: check the sent folder, then use "Approve & retry").
- **Helper offline:** Integrations page; re-pair if the token was revoked (close code 4401).
- **Subscription mismatch:** replay the Stripe event; handlers are idempotent.
- **Opt-out request:** Settings → Do-not-contact; deletion of a candidate is a `Candidate` delete (cascades messages/interviews links).
- **Tenant data export / deletion on cancellation:** per tenant `DELETE FROM Tenant WHERE id=…` cascades all tenant-owned rows.

## Migrating Carlos's existing data (tenant #1)

`npm run import:sqlite -- --db recruit.db --tenant <slug> --dry-run`, review the report, then run without `--dry-run`. Legacy pre-2026 tables are skipped by design; unmapped tables are listed, not guessed. For the exact schema, adjust the mappings in `scripts/import-sqlite.ts` after a dry run.
