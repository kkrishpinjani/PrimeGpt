import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { Badge, fmtDate, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { isDoNotContact } from "@/lib/brain/rules";
import { deleteContact, draftContactEmail, updateContact } from "../../actions/contacts";
import { addDnc } from "../../actions/recruiting";

export const metadata = { title: "Contact" };

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { error } = await searchParams;
  const [c, clients] = await Promise.all([
    ctx.db.contact.findFirst({ where: { id }, include: { client: true, messages: { orderBy: { createdAt: "asc" } } } }),
    ctx.db.client.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!c) notFound();
  const dnc = await isDoNotContact(ctx.tenant.id, c);

  return (
    <>
      <PageHeader
        title={c.fullName}
        subtitle={[c.title, c.client?.name].filter(Boolean).join(" · ")}
        actions={ctx.canWrite && !dnc && <form action={draftContactEmail.bind(null, c.id)}><SubmitButton className="btn-primary" pending="Drafting…">Draft intro email</SubmitButton></form>}
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {dnc && <Notice tone="bad">This contact is on the do-not-contact list. Outreach is blocked.</Notice>}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="h2 mb-3">Message thread</h2>
          {c.messages.length === 0 ? <p className="muted">Nothing sent or received yet.</p> : (
            <ol className="space-y-3">
              {c.messages.map((m) => (
                <li key={m.id} className={`rounded-xl border border-line p-3 text-sm ${m.direction === "INBOUND" ? "bg-brand/5" : ""}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <Badge>{m.channel.toLowerCase()}</Badge>
                    <span className="muted">{m.direction === "INBOUND" ? "received" : "sent by us"} · {fmtDate(m.sentAt ?? m.createdAt)}</span>
                    <StatusBadge s={m.status} />
                    {m.status === "DRAFT" && <Link href={`/app/outreach?focus=${m.id}`} className="underline">review in Outreach</Link>}
                  </div>
                  {m.subject && <div className="font-medium">{m.subject}</div>}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="space-y-6">
          <form action={updateContact.bind(null, c.id)} className="card space-y-3">
            <h2 className="h2">Details</h2>
            <fieldset disabled={!ctx.canWrite} className="space-y-3">
              <div><label className="label">Full name</label><input name="fullName" defaultValue={c.fullName} required className="input" /></div>
              <div><label className="label">Title</label><input name="title" defaultValue={c.title ?? ""} className="input" /></div>
              <div><label className="label">Client</label><select name="clientId" defaultValue={c.clientId ?? ""} className="input"><option value="">None</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
              <div><label className="label">Email</label><input name="email" type="email" defaultValue={c.email ?? ""} className="input" /></div>
              <div><label className="label">Phone</label><input name="phone" defaultValue={c.phone ?? ""} className="input" /></div>
              <div><label className="label">LinkedIn URL</label><input name="linkedinUrl" defaultValue={c.linkedinUrl ?? ""} className="input" /></div>
              {ctx.canWrite && <SubmitButton className="btn-primary btn-sm">Save</SubmitButton>}
            </fieldset>
          </form>
          {ctx.canWrite && (
            <div className="card space-y-3">
              <h2 className="h2">Contact preferences</h2>
              {!dnc && (
                <form action={addDnc} className="space-y-2">
                  <input type="hidden" name="email" value={c.email ?? ""} /><input type="hidden" name="phone" value={c.phone ?? ""} /><input type="hidden" name="linkedinUrl" value={c.linkedinUrl ?? ""} />
                  <input type="hidden" name="reason" value="Added from contact page" />
                  <SubmitButton className="btn-sm" confirm="Add this contact to the do-not-contact list?">Add to do-not-contact</SubmitButton>
                </form>
              )}
              <form action={deleteContact.bind(null, c.id)}><SubmitButton className="btn-sm btn-danger" confirm="Delete this contact? Draft messages to them are deleted too.">Delete contact</SubmitButton></form>
            </div>
          )}
          <Link href="/app/contacts" className="muted text-sm underline">← All contacts</Link>
        </aside>
      </div>
    </>
  );
}
