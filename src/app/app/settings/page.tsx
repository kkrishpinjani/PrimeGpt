import { requireCtx } from "@/lib/auth";
import { fmtDate, Notice, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/db";
import { addDnc, removeDnc } from "../actions/recruiting";
import { updateWorkspace } from "../actions/settings";
import { deleteWorkspace } from "../actions/data";

export const metadata = { title: "Settings" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireCtx();
  const { error } = await searchParams;
  const t = ctx.tenant;
  const [dnc, audit] = await Promise.all([
    ctx.db.doNotContact.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    ctx.isAdmin ? prisma.auditLog.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: "desc" }, take: 15 }) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Settings" />
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={updateWorkspace} className="card space-y-3">
          <h2 className="h2">Workspace</h2>
          <fieldset disabled={!ctx.isAdmin} className="space-y-3">
            <div><label className="label">Workspace name</label><input name="name" defaultValue={t.name} className="input" /></div>
            <div><label className="label">Brand name (shown to your team{t.kind === "WHITELABEL" ? " and clients" : ""})</label><input name="brandName" defaultValue={t.brandName ?? ""} className="input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Brand colour</label><input name="brandColor" defaultValue={t.brandColor ?? ""} placeholder="#4f46e5" className="input" pattern="#[0-9a-fA-F]{6}" /></div>
              <div><label className="label">Monthly AI budget ($)</label><input name="aiBudgetDollars" type="number" min={0} defaultValue={t.aiMonthlyBudgetCents / 100} className="input" /></div>
            </div>
            <div><label className="label">Logo URL (https)</label><input name="brandLogoUrl" defaultValue={t.brandLogoUrl ?? ""} className="input" /></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="autonomyInboxWatch" defaultChecked={t.autonomyInboxWatch} className="mt-1" /><span>Watch my inbox automatically (every 10 minutes)<br /><span className="muted text-xs">Off = on-demand only. Even when on, nothing is ever sent without your approval.</span></span></label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="autonomyFollowups" defaultChecked={t.autonomyFollowups} className="mt-1" /><span>Prepare follow-up drafts automatically<br /><span className="muted text-xs">Unanswered outreach gets a follow-up <b>draft</b> after the days below. Drafts still need your approval to send.</span></span></label>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Days of silence before a follow-up</label><input name="followupDays" type="number" min={1} max={30} defaultValue={t.followupDays} className="input" /></div>
              <div><label className="label">Max follow-ups per person</label><input name="maxFollowups" type="number" min={1} max={5} defaultValue={t.maxFollowups} className="input" /></div>
            </div>
            {ctx.isAdmin && <SubmitButton className="btn-primary">Save</SubmitButton>}
          </fieldset>
        </form>

        <section className="card">
          <h2 className="h2">Do-not-contact list</h2>
          <p className="muted mt-1">Blocked at draft time and again at send time. Opt-out replies are added automatically.</p>
          {ctx.canWrite && (
            <form action={addDnc} className="mt-3 grid gap-2 sm:grid-cols-3">
              <input name="email" type="email" placeholder="Email" className="input" /><input name="phone" placeholder="Phone" className="input" /><input name="linkedinUrl" placeholder="LinkedIn URL" className="input" />
              <input name="reason" placeholder="Reason" className="input sm:col-span-2" /><SubmitButton className="btn-sm">Add</SubmitButton>
            </form>
          )}
          <ul className="mt-4 max-h-72 divide-y divide-line overflow-y-auto text-sm">
            {dnc.length === 0 && <li className="muted py-2">Empty.</li>}
            {dnc.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 truncate">{d.email ?? d.phone ?? d.linkedinUrl}<span className="muted ml-2 text-xs">{d.reason}</span></span>
                {ctx.isAdmin && <form action={removeDnc.bind(null, d.id)}><SubmitButton className="btn-sm" confirm="Remove from do-not-contact?">Remove</SubmitButton></form>}</li>
            ))}
          </ul>
        </section>

        <section className="card lg:col-span-2">
          <h2 className="h2">Your data</h2>
          <p className="muted mt-1">You own your data. Export it any time, or erase the whole workspace when you leave.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/export/candidates" className="btn">Export candidates (CSV)</a>
            {ctx.isAdmin && <a href="/api/export/workspace" className="btn">Export everything (JSON)</a>}
          </div>
          {ctx.role === "OWNER" && (
            <details className="mt-5 rounded-xl border border-bad/30 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-bad">Delete this workspace</summary>
              <form action={deleteWorkspace} className="mt-3 space-y-3">
                <p className="muted">Permanently deletes every candidate, contact, message, role and setting in this workspace, cancels the subscription and cannot be undone. Export your data first.</p>
                <div><label className="label">Type <b>{t.slug}</b> to confirm</label><input name="confirm" className="input max-w-xs" autoComplete="off" /></div>
                <SubmitButton className="btn-danger btn-sm" confirm="Delete the entire workspace permanently?">Delete workspace</SubmitButton>
              </form>
            </details>
          )}
        </section>

        {ctx.isAdmin && (
          <section className="card lg:col-span-2">
            <h2 className="h2 mb-2">Recent activity (audit log)</h2>
            <table className="tbl"><tbody>{audit.map((a) => <tr key={a.id}><td className="muted w-40 whitespace-nowrap text-xs">{fmtDate(a.createdAt)}</td><td>{a.action}</td><td className="muted text-xs">{a.detail}</td></tr>)}</tbody></table>
          </section>
        )}
      </div>
    </>
  );
}
