# RecruitGPT.ai

Self-serve, multi-tenant AI recruiting platform: source, score, brief, reach out, watch the inbox, schedule, and win clients, with a human approving every message.

Built from the *Platform Transfer & Launch Scope* (Expert Recruiting, Aug 2026). Architecture: **cloud brain + local hands**.

```
 Browser ──► Next.js app (web, auth, billing, UI) ──► MySQL (multi-tenant)
                        │ enqueue Runs                        ▲
                        ▼                                     │
              Worker (job queue + executor gateway) ──────────┘
                │  Claude (platform key)   │ Gmail / Calendar / Quo / Apollo / Exa (per tenant)
                │  generic primitives only ▼
                └──────────────► Local helper on the customer's PC ──► their signed-in Chrome ──► LinkedIn / Indeed
```

## Quick start (local)

Prereqs: Node 20+, MySQL 8.

```bash
npm install
cp .env.example .env          # fill DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY (see below)
npm run db:push               # create tables
npm run db:seed               # optional demo workspace: demo@recruitgpt.local / DemoPass-12345
npm run dev                   # web on http://localhost:3009
npm run worker                # in a second terminal: job queue + helper gateway on :8009 (backend)
npm test                      # 46 tests (needs the DB)
npm run build:helper          # rebuild the downloadable local helper bundle
```

Generate secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (use for `ENCRYPTION_KEY` and `SESSION_SECRET`).

Everything works without third-party keys: with no `ANTHROPIC_API_KEY` scoring/briefs/drafts use built-in fallbacks; with no Stripe keys a dev-only "activate demo subscription" button appears (disabled in production).

## Layout

| Path | What |
|---|---|
| `src/app` | Next.js app: marketing site, auth, recruiter UI (`/app/*`), API routes, webhooks |
| `src/app/app/actions` | Server actions (recruiting, outreach with approval gate, settings, billing) |
| `src/lib/brain` | **The recruiting IP** (prompts, scoring, briefs, outreach, rules). Server-only. |
| `src/lib/integrations` | Gmail/Calendar, Quo SMS, Apollo, Exa; per-tenant encrypted credentials |
| `src/lib/tenant-db.ts` | Tenant isolation layer (every query forced to the tenant) |
| `src/lib/protocol.ts` | The only thing that crosses to the customer's machine: generic browser primitives |
| `worker/` | Persistent worker: queue, sourcing/send/inbox jobs, executor gateway, browser drivers |
| `executor/` | The local helper (separate package; contains no recruiting logic) |
| `prisma/` | Schema + demo seed |
| `scripts/` | SQLite → MySQL migration, backups |
| `tests/` | Isolation gate, IP boundary, approval gate, rules, gateway round-trip |
| `docs/` | Architecture, operations, local helper, scope traceability |

## Docs

- [docs/SCOPE_TRACEABILITY.md](docs/SCOPE_TRACEABILITY.md): every section of the 13-page scope → what is built and what remains
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/OPERATIONS.md](docs/OPERATIONS.md): go-live checklist, secrets, backups, monitoring
- [docs/LOCAL_HELPER.md](docs/LOCAL_HELPER.md)
- [docs/PROPOSAL_ANSWERS.md](docs/PROPOSAL_ANSWERS.md): answers to the scope document's §10 questions
