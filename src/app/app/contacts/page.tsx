import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createContact } from "../actions/contacts";

export const metadata = { title: "Contacts" };

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx();
  const { q } = await searchParams;
  const [contacts, clients] = await Promise.all([
    ctx.db.contact.findMany({
      where: q ? { OR: [{ fullName: { contains: q } }, { email: { contains: q } }, { title: { contains: q } }, { client: { name: { contains: q } } }] } : {},
      orderBy: { createdAt: "desc" }, take: 300, include: { client: true, _count: { select: { messages: true } } },
    }),
    ctx.db.client.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Contacts" subtitle="People at your clients and prospects. Every message to or from them is logged on their page." />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div>
          <form method="get" className="card mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search name, email, title or client" className="input" /><button className="btn btn-primary">Search</button></form>
          {contacts.length === 0 ? <Empty title="No contacts yet">Add a contact, or run prospecting to find decision makers.</Empty> : (
            <div className="card overflow-x-auto p-0">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Client</th><th>Email</th><th>Messages</th></tr></thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/app/contacts/${c.id}`} className="font-medium hover:underline">{c.fullName}</Link><div className="muted text-xs">{c.title}</div></td>
                      <td>{c.client ? <Link href={`/app/clients/${c.client.id}`} className="underline">{c.client.name}</Link> : <span className="muted">—</span>}</td>
                      <td className="text-sm">{c.email ?? <span className="muted">—</span>}</td>
                      <td>{c._count.messages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {ctx.canWrite && (
          <form action={createContact} className="card h-fit space-y-3">
            <h2 className="h2">Add contact</h2>
            <div><label className="label">Full name *</label><input name="fullName" required className="input" /></div>
            <div><label className="label">Title</label><input name="title" className="input" /></div>
            <div><label className="label">Client</label><select name="clientId" className="input"><option value="">None</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
            <div><label className="label">Phone</label><input name="phone" className="input" /></div>
            <div><label className="label">LinkedIn URL</label><input name="linkedinUrl" type="url" className="input" /></div>
            <SubmitButton className="btn-primary">Add contact</SubmitButton>
          </form>
        )}
      </div>
    </>
  );
}
