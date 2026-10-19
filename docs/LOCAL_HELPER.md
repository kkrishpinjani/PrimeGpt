# Local helper ("local hands")

A small app on the customer's computer. It drives **their own signed-in Chrome**, on **their own connection**, for LinkedIn Recruiter / Indeed. It holds no recruiting logic.

## Install (customer): one click

1. In RecruitGPT: **Integrations → Local helper → Download Windows installer** (a workspace admin does this).
2. Double-click `RecruitGPT-Helper-Setup.cmd` on the computer that will run LinkedIn/Indeed. It installs Node.js if missing (via winget), downloads the helper, pairs it using a single-use code embedded in the file (valid 1 hour), registers it to start at Windows sign-in, and opens the dedicated browser window.
3. In that window, sign in to LinkedIn Recruiter and/or Indeed once. Leave it open.
4. The Integrations page shows the device **online**.

The helper **updates itself**: every 6 hours (and on start) it compares `/helper/version.json` to its version, downloads the new bundle, verifies its SHA-256, replaces itself and restarts. Publish a new version with `npm run build:helper` and redeploy.

Manual / developer use: `pair <CODE> --server URL` · `chrome` · `run` · `version`.

## Managed sessions (customers who cannot run the helper)

A workspace admin clicks **Request a managed session**. A platform operator then opens **Platform admin → Provision managed**, which creates a managed device and shows a single-use code. Run the hosted helper (`Dockerfile.helper`) with `RGPT_PAIR_CODE=<code>` and `RGPT_PROXY=<residential proxy>`. The customer signs in to LinkedIn/Indeed once through the container's remote browser view (noVNC on port 6080). Same protocol, same safety rails. **Unverified**: needs a residential proxy provider and a licensed account to validate, and terms-of-service review for hosted use.

## What it does and does not do

- Connects **outbound** to the cloud gateway over WebSocket (TLS in production); authenticates with a long-lived device token (only its SHA-256 is stored server-side; revoke from the web app; re-pair after revoke).
- Accepts only schema-validated primitives. Rejects anything else, non-https, and any host other than `linkedin.com` / `indeed.com`.
- Paces itself like a person; hard local rate limits.
- **Never solves or bypasses CAPTCHAs/verifications**: reports them; the cloud pauses the run and asks the user.
- Stores nothing but the device token (`~/.recruitgpt/config.json`, mode 600). Does not read or store LinkedIn/Indeed passwords.

## Risks to validate before scaling (scope §8)

- Selectors in `worker/drivers/browser-sources.ts` are best-effort and must be validated against live LinkedIn Recruiter / Indeed Smart Sourcing with a real licensed account (they change often; fixes ship server-side).
- Session warmth / residential IP is the main scaling risk; validate with Carlos's account first (Phase 1).
- ToS: see `/compliance`. Needs counsel sign-off.
