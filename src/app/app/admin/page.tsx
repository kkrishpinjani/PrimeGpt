import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, fmtDate, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getPlans, isPriced } from "@/lib/plans";
import { provisionManagedDevice, setPassThrough, setTenantKind } from "../actions/admin";
import { setExpertRequestStatus } from "../actions/expert";

export const metadata = { title: "Platform admin" };

export default async function Admin({ searchParams }: { searchParams: Promise<{ code?: string; tenant?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.user.isPlatformAdmin) redirect("/app?denied=1");
  const sp = await searchParams;
  const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
  const [expertReqs, tenants, usage] = await Promise.all([
    prisma.expertRequest.findMany({ where: { status: { not: "closed" } }, orderBy: { createdAt: "desc" }, take: 50, include: { tenant: true } }),
    prisma.tenant.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { memberships: true, candidates: true } }, devices: { where: { revokedAt: null } } } }),
    prisma.usageEvent.groupBy({ by: ["tenantId"], where: { createdAt: { gte: since }, kind: "ai_tokens" }, _sum: { costCents: true } }),
  ]);
  const spend = new Map(usage.map((u) => [u.tenantId, u._sum.costCents ?? 0]));
  const plans = getPlans();

  return (
    <>
      <PageHeader title="Platform admin" subtitle="All workspaces on the platform. Visible only to platform operators." />
      {sp.code && <Notice tone="ok">Managed-session pairing code (valid 24h, single use): <b className="font-mono text-lg tracking-widest">{sp.code}</b>. Start the hosted helper with <code>RGPT_PAIR_CODE={sp.code}</code> (see <code>Dockerfile.helper</code>).</Notice>}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {Object.values(plans).map((p) => <Badge key={p.kind} tone={isPriced(p) ? "ok" : "warn"}>{p.name}: {isPriced(p) ? "priced" : "no price set (env)"}</Badge>)}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Workspace</th><th>Plan</th><th>Subscription</th><th>Users</th><th>Candidates</th><th>AI spend (mo)</th><th>Helper</th><th>Usage billing</th><th /></tr></thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td><div className="font-medium">{t.name}</div><div className="muted text-xs">{t.slug} · {fmtDate(t.createdAt)}</div></td>
                <td>
                  <div className="flex gap-1">
                    {(["STANDARD", "SOLO", "WHITELABEL"] as const).map((k) => (
                      <form key={k} action={setTenantKind.bind(null, t.id, k)}><button className={`btn btn-sm ${t.kind === k ? "btn-primary" : ""}`}>{k === "WHITELABEL" ? "white-label" : k.toLowerCase()}</button></form>
                    ))}
                  </div>
                </td>
                <td><StatusBadge s={t.subscriptionStatus === "NONE" ? "inactive" : t.subscriptionStatus} /></td>
                <td>{t._count.memberships}</td>
                <td>{t._count.candidates}</td>
                <td>${((spend.get(t.id) ?? 0) / 100).toFixed(2)}</td>
                <td className="text-xs">
                  {t.devices.length ? t.devices.map((d) => <div key={d.id}>{d.kind} · {d.online ? <span className="text-ok">online</span> : "offline"}</div>) : <span className="muted">none</span>}
                  {t.managedSessionRequested && <Badge tone="warn">managed requested</Badge>}
                </td>
                <td><form action={setPassThrough.bind(null, t.id, !t.passThroughUsage)}><button className="btn btn-sm">{t.passThroughUsage ? "on" : "off"}</button></form></td>
                <td className="text-right"><form action={provisionManagedDevice.bind(null, t.id)}><SubmitButton className="btn-sm">Provision managed</SubmitButton></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card mt-6">
        <h2 className="h2 mb-3">Expert help requests ({expertReqs.length} open)</h2>
        {expertReqs.length === 0 ? <p className="muted">None open.</p> : (
          <ul className="divide-y divide-line">
            {expertReqs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <span className="max-w-3xl"><b>{r.tenant.name}</b> <span className="muted text-xs">{fmtDate(r.createdAt)} · {r.kind.replace("_", " ")}</span><br />{r.message}</span>
                <span className="flex gap-1">{(["contacted", "closed"] as const).map((st) => <form key={st} action={setExpertRequestStatus.bind(null, r.id, st)}><button className="btn btn-sm">{st}</button></form>)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
