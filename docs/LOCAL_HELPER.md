# Local helper ("local hands")

A small app on the customer's computer. It drives **their own signed-in Chrome**, on **their own connection**, for LinkedIn Recruiter / Indeed. It holds no recruiting logic.

## Install (customer)

1. In RecruitGPT: **Integrations → Local helper → Get pairing code** (valid 15 min, single use).
2. On the computer (Windows): from the `executor/` folder run
   `.\install.ps1 -Code ABCD-1234 -Server https://recruitgpt.ai`
   (installs, pairs, and registers a Scheduled Task that starts at sign-in).
3. `npx tsx src/index.ts chrome` opens a **dedicated Chrome profile** (`~/.recruitgpt/chrome-profile`, remote-debugging on `127.0.0.1:9222`). Sign in to LinkedIn Recruiter and/or Indeed there once. Leave it open.
4. The Integrations page shows the device **online**. Searches that include LinkedIn/Indeed now work.

Manual: `pair <CODE> --server URL` · `chrome` · `run`.

## What it does and does not do

- Connects **outbound** to the cloud gateway over WebSocket (TLS in production); authenticates with a long-lived device token (only its SHA-256 is stored server-side; revoke from the web app; re-pair after revoke).
- Accepts only schema-validated primitives. Rejects anything else, non-https, and any host other than `linkedin.com` / `indeed.com`.
- Paces itself like a person; hard local rate limits.
- **Never solves or bypasses CAPTCHAs/verifications**: reports them; the cloud pauses the run and asks the user.
- Stores nothing but the device token (`~/.recruitgpt/config.json`, mode 600). Does not read or store LinkedIn/Indeed passwords.

## Packaging for non-technical customers (next step)

Today it is a Node package + PowerShell installer. For GA, wrap `executor/` as a signed installer (Electron tray app or Node SEA + MSI/pkg) with an auto-updater; the protocol and pairing are already final. Evaluate **managed residential sessions** for tenants who cannot self-host: same protocol, helper runs on provider infrastructure.

## Risks to validate before scaling (scope §8)

- Selectors in `worker/drivers/browser-sources.ts` are best-effort and must be validated against live LinkedIn Recruiter / Indeed Smart Sourcing with a real licensed account (they change often; fixes ship server-side).
- Session warmth / residential IP is the main scaling risk; validate with Carlos's account first (Phase 1).
- ToS: see `/compliance`. Needs counsel sign-off.
