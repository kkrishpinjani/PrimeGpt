import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { updateClient } from "../../actions/contacts";

export const metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const c = await ctx.db.client.findFirst({ where: { id }, include: { jobOrders: { orderBy: { createdAt: "desc" } }, contacts: { orderBy: { fullName: "asc" } } } });
  if (!c) notFound();
  return (
    <>
      <PageHeader title={c.name} subtitle={[c.industry, c.website].filter(Boolean).join(" · ")} actions={ctx.canWrite && <Link href="/app/jobs/new" className="btn btn-primary">New role</Link>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2 mb-3">Roles ({c.jobOrders.length})</h2>
          {c.jobOrders.length === 0 ? <p className="muted">No roles for this client yet.</p> : (
            <ul className="divide-y divide-line">{c.jobOrders.map((j) => <li key={j.id} className="flex items-center justify-between py-2.5"><Link href={`/app/jobs/${j.id}`} className="font-medium hover:underline">{j.title}</Link><StatusBadge s={j.status} /></li>)}</ul>
          )}
        </section>
        <section className="card">
          <div className="mb-3 flex items-center justify-between"><h2 className="h2">Contacts ({c.contacts.length})</h2><Link href="/app/contacts" className="muted underline">Manage</Link></div>
          {c.contacts.length === 0 ? <p className="muted">No contacts yet.</p> : (
            <ul className="divide-y divide-line">{c.contacts.map((x) => <li key={x.id} className="py-2.5"><Link href={`/app/contacts/${x.id}`} className="font-medium hover:underline">{x.fullName}</Link><div className="muted text-xs">{[x.title, x.email].filter(Boolean).join(" · ")}</div></li>)}</ul>
          )}
        </section>
        <form action={updateClient.bind(null, c.id)} className="card space-y-3 lg:col-span-2">
          <h2 className="h2">Edit client</h2>
          <fieldset disabled={!ctx.canWrite} className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Name</label><input name="name" defaultValue={c.name} required className="input" /></div>
            <div><label className="label">Industry</label><input name="industry" defaultValue={c.industry ?? ""} className="input" /></div>
            <div><label className="label">Website</label><input name="website" type="url" defaultValue={c.website ?? ""} className="input" /></div>
            <div><label className="label">Status</label><select name="status" defaultValue={c.status} className="input"><option value="active">active</option><option value="paused">paused</option><option value="closed">closed</option></select></div>
            <div className="sm:col-span-2"><label className="label">Notes</label><textarea name="notes" defaultValue={c.notes ?? ""} className="input" /></div>
            {ctx.canWrite && <div><SubmitButton className="btn-primary">Save client</SubmitButton></div>}
          </fieldset>
        </form>
      </div>
    </>
  );
}
