import { requireCtx } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import { createClient } from "../actions/recruiting";

export const metadata = { title: "Clients" };

export default async function Clients() {
  const ctx = await requireCtx();
  const clients = await ctx.db.client.findMany({ orderBy: { name: "asc" }, include: { jobOrders: true, contacts: true } });
  return (
    <>
      <PageHeader title="Clients" subtitle="Companies you recruit for." />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {clients.length === 0 ? <Empty title="No clients yet" /> : (
            <div className="card overflow-x-auto p-0"><table className="tbl"><thead><tr><th>Client</th><th>Industry</th><th>Open roles</th><th>Contacts</th></tr></thead><tbody>
              {clients.map((c) => (
                <tr key={c.id}><td><div className="font-medium">{c.name}</div>{c.website && <a href={c.website} target="_blank" rel="noreferrer" className="muted text-xs underline">{c.website}</a>}</td><td>{c.industry}</td>
                  <td>{c.jobOrders.filter((j) => j.status === "open").map((j) => <div key={j.id}><Link href={`/app/jobs/${j.id}`} className="underline">{j.title}</Link></div>)}</td><td>{c.contacts.length}</td></tr>
              ))}
            </tbody></table></div>
          )}
        </div>
        {ctx.canWrite && (
          <form action={createClient} className="card h-fit space-y-3">
            <h2 className="h2">Add client</h2>
            <div><label className="label">Name *</label><input name="name" required className="input" /></div>
            <div><label className="label">Industry</label><input name="industry" className="input" /></div>
            <div><label className="label">Website</label><input name="website" type="url" className="input" /></div>
            <div><label className="label">Notes</label><textarea name="notes" className="input" /></div>
            <SubmitButton className="btn-primary">Add client</SubmitButton>
          </form>
        )}
      </div>
    </>
  );
}
