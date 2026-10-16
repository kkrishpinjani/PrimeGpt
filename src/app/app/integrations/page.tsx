import { requireCtx } from "@/lib/auth";
import { Badge, fmtDate, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { listConnected } from "@/lib/integrations/store";
import { googleConfigured } from "@/lib/integrations/google";
import { quoWebhookToken } from "@/lib/integrations/quo-token";
import { createPairingCode, disconnect, revokeDevice, saveByoKey, saveQuo } from "../actions/settings";

export const metadata = { title: "Integrations" };

export default async function Integrations({ searchParams }: { searchParams: Promise<{ code?: string; error?: string; connected?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const [conn, devices] = await Promise.all([listConnected(ctx.tenant.id), ctx.db.executorDevice.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" } })]);
  const has = (p: string) => conn.find((c) => c.provider === p);
  const admin = ctx.isAdmin;
  const appUrl = process.env.APP_URL ?? "";

  return (
    <>
      <PageHeader title="Integrations" subtitle="Each workspace connects its own email, calendar and phone. Credentials are encrypted and never shown again." />
      {sp.connected && <Notice tone="ok">Connected {sp.connected}.</Notice>}
      {sp.error && <Notice tone="bad">{sp.error === "google_not_configured" ? "Google OAuth is not configured on this server (GOOGLE_CLIENT_ID / SECRET)." : `Connection problem: ${sp.error}`}</Notice>}

      <section className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="h2">Local helper (browser automation)</h2>
            <p className="muted mt-1 max-w-2xl">A small app on your computer that drives your own signed-in LinkedIn Recruiter / Indeed browser, on your own connection. It only receives generic browser steps. See <code>docs/LOCAL_HELPER.md</code>.</p>
          </div>
          {admin && (
            <form action={createPairingCode} className="flex gap-2"><input name="label" placeholder="Label, e.g. Carlos laptop" className="input w-48" /><SubmitButton className="btn-primary">Get pairing code</SubmitButton></form>
          )}
        </div>
        {sp.code && (
          <div className="mt-4 rounded-lg border border-brand/40 bg-brand/5 p-4">
            <div className="muted text-xs">One-time code, valid 15 minutes</div>
            <div className="mt-1 font-mono text-3xl font-semibold tracking-widest">{sp.code}</div>
            <pre className="mt-3 overflow-x-auto rounded bg-black/5 p-3 text-xs">{`recruitgpt-helper pair ${sp.code} --server ${appUrl}\nrecruitgpt-helper chrome   # sign in to LinkedIn / Indeed in that window\nrecruitgpt-helper run`}</pre>
          </div>
        )}
        <table className="tbl mt-4"><thead><tr><th>Device</th><th>Status</th><th>Last seen</th><th /></tr></thead><tbody>
          {devices.length === 0 && <tr><td colSpan={4} className="muted">No devices yet.</td></tr>}
          {devices.map((d) => (
            <tr key={d.id}><td>{d.label}<div className="muted text-xs">{d.platformInfo}</div></td>
              <td>{d.tokenHash ? <StatusBadge s={d.online ? "online" : "offline"} /> : <Badge tone="warn">awaiting pairing</Badge>}</td><td className="muted text-xs">{fmtDate(d.lastSeenAt)}</td>
              <td className="text-right">{admin && <form action={revokeDevice.bind(null, d.id)}><SubmitButton className="btn-sm" confirm="Revoke this device?">Revoke</SubmitButton></form>}</td></tr>
          ))}
        </tbody></table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="mb-2 flex items-center justify-between"><h2 className="h2">Gmail + Google Calendar</h2>{has("gmail") ? <Badge tone="ok">{has("gmail")!.accountLabel ?? "connected"}</Badge> : <Badge>not connected</Badge>}</div>
          <p className="muted">Send email, watch replies, and book interviews with Meet links from your own Google account.</p>
          {admin && (has("gmail") ? <form action={disconnect.bind(null, "gmail")} className="mt-3"><SubmitButton className="btn-sm" confirm="Disconnect Google?">Disconnect</SubmitButton></form>
            : <a href="/api/integrations/google/start" className={`btn btn-primary mt-3 ${googleConfigured() ? "" : "pointer-events-none opacity-50"}`}>Connect Google</a>)}
          {!googleConfigured() && <p className="muted mt-2 text-xs">Server admin: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>}
        </section>

        <section className="card">
          <div className="mb-2 flex items-center justify-between"><h2 className="h2">SMS (Quo / OpenPhone)</h2>{has("quo") ? <Badge tone="ok">{has("quo")!.accountLabel ?? "connected"}</Badge> : <Badge>not connected</Badge>}</div>
          {admin && (has("quo") ? (
            <>
              <p className="muted text-xs">Inbound webhook (add in Quo, event <code>message.received</code>):</p>
              <code className="mt-1 block break-all rounded bg-black/5 p-2 text-xs">{`${appUrl}/api/webhooks/quo/${quoWebhookToken(ctx.tenant.id)}`}</code>
              <form action={disconnect.bind(null, "quo")} className="mt-3"><SubmitButton className="btn-sm">Disconnect</SubmitButton></form>
            </>
          ) : (
            <form action={saveQuo} className="mt-2 space-y-2">
              <input name="apiKey" type="password" required placeholder="API key" className="input" autoComplete="off" />
              <input name="phoneNumberId" required placeholder="Phone number ID (PN…)" className="input" />
              <input name="from" required placeholder="Your number, +1…" className="input" />
              <SubmitButton className="btn-primary btn-sm">Connect</SubmitButton>
            </form>
          ))}
        </section>

        {(["apollo", "exa"] as const).map((p) => (
          <section key={p} className="card">
            <div className="mb-2 flex items-center justify-between"><h2 className="h2">{p === "apollo" ? "Apollo (company & contact data)" : "Exa (web search)"}</h2>{has(p) ? <Badge tone="ok">your key</Badge> : <Badge>platform key</Badge>}</div>
            <p className="muted">Provided by the platform by default. Bring your own key to use your own quota.</p>
            {admin && (has(p) ? <form action={disconnect.bind(null, p)} className="mt-3"><SubmitButton className="btn-sm">Use platform key</SubmitButton></form>
              : <form action={saveByoKey.bind(null, p)} className="mt-3 flex gap-2"><input name="apiKey" type="password" required placeholder="Your API key" className="input" autoComplete="off" /><SubmitButton className="btn-sm">Save</SubmitButton></form>)}
          </section>
        ))}
      </div>
    </>
  );
}
