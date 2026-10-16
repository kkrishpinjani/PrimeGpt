import { requireCtx } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, fmtDate, Notice, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { changeRole, inviteMember, removeMember } from "../actions/settings";

export const metadata = { title: "Team" };

export default async function Team({ searchParams }: { searchParams: Promise<{ invite?: string; mailed?: string }> }) {
  const ctx = await requireCtx();
  const { invite, mailed } = await searchParams;
  const [members, invites] = await Promise.all([
    prisma.membership.findMany({ where: { tenantId: ctx.tenant.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    prisma.invite.findMany({ where: { tenantId: ctx.tenant.id, acceptedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  return (
    <>
      <PageHeader title="Team" subtitle="Roles: owner (billing & everything), admin (settings & integrations), recruiter (day-to-day work), viewer (read-only)." />
      {invite && <Notice tone="ok">Invite created{mailed ? " and emailed" : ""}. Share this link (valid 7 days): <code className="break-all">{`${process.env.APP_URL}/signup?invite=${invite}`}</code></Notice>}
      <div className="card mb-6 overflow-x-auto p-0"><table className="tbl"><thead><tr><th>Member</th><th>Role</th><th /></tr></thead><tbody>
        {members.map((m) => (
          <tr key={m.id}><td><div className="font-medium">{m.user.name}</div><div className="muted text-xs">{m.user.email}</div></td>
            <td>{ctx.role === "OWNER" && m.userId !== ctx.user.id ? (
              <div className="flex gap-1">{(["ADMIN", "RECRUITER", "VIEWER"] as const).map((r) => <form key={r} action={changeRole.bind(null, m.id, r)}><button className={`btn btn-sm ${m.role === r ? "btn-primary" : ""}`}>{r.toLowerCase()}</button></form>)}</div>
            ) : <Badge>{m.role.toLowerCase()}</Badge>}</td>
            <td className="text-right">{ctx.isAdmin && m.userId !== ctx.user.id && m.role !== "OWNER" && <form action={removeMember.bind(null, m.id)}><SubmitButton className="btn-sm" confirm={`Remove ${m.user.name}?`}>Remove</SubmitButton></form>}</td></tr>
        ))}
      </tbody></table></div>
      {ctx.isAdmin && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form action={inviteMember} className="card space-y-3">
            <h2 className="h2">Invite a teammate</h2>
            <input name="email" type="email" required placeholder="email@company.com" className="input" />
            <select name="role" className="input" defaultValue="RECRUITER"><option value="RECRUITER">Recruiter</option><option value="ADMIN">Admin</option><option value="VIEWER">Viewer</option></select>
            <SubmitButton className="btn-primary">Create invite link</SubmitButton>
          </form>
          <div className="card"><h2 className="h2 mb-2">Pending invites</h2>{invites.length === 0 ? <p className="muted">None.</p> : invites.map((i) => <div key={i.id} className="flex justify-between border-b border-line py-2 text-sm last:border-0"><span>{i.email} <Badge>{i.role.toLowerCase()}</Badge></span><span className="muted text-xs">expires {fmtDate(i.expiresAt)}</span></div>)}</div>
        </div>
      )}
    </>
  );
}
