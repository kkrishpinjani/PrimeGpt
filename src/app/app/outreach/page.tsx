import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Badge, Empty, fmtDate, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { approveAndSend, bulkDraft, discardDraft, draftFollowup, runFollowupsNow, runInboxNow, updateDraft } from "../actions/outreach";

export const metadata = { title: "Outreach" };

export default async function Outreach({ searchParams }: { searchParams: Promise<{ tab?: string; focus?: string; error?: string }> }) {
  const ctx = await requireCtx();
  const { tab = "approve", focus, error } = await searchParams;
  const include = { candidate: true, contact: true } as const;
  const [drafts, sending, sent, replies, jobs] = await Promise.all([
    ctx.db.message.findMany({ where: { direction: "OUTBOUND", status: { in: ["DRAFT", "FAILED"] } }, orderBy: { createdAt: "desc" }, include, take: 100 }),
    ctx.db.message.count({ where: { status: { in: ["APPROVED", "SENDING"] } } }),
    ctx.db.message.findMany({ where: { direction: "OUTBOUND", status: "SENT" }, orderBy: { sentAt: "desc" }, include, take: 100 }),
    ctx.db.message.findMany({ where: { direction: "INBOUND" }, orderBy: { createdAt: "desc" }, include, take: 100 }),
    ctx.db.jobOrder.findMany({ where: { status: "open" } }),
  ]);
  const tabs: Array<[string, string, number]> = [["approve", "Awaiting approval", drafts.length], ["sent", "Sent", sent.length], ["replies", "Replies", replies.length]];
  const who = (m: (typeof drafts)[number]) => m.candidate?.fullName ?? m.contact?.fullName ?? "Unknown";
  const whoHref = (m: (typeof drafts)[number]) => (m.candidateId ? `/app/candidates/${m.candidateId}` : m.contactId ? `/app/contacts/${m.contactId}` : "#");

  return (
    <>
      <PageHeader title="Outreach" subtitle="Draft → approve → send. Nothing leaves without a recruiter approving it." actions={ctx.canWrite && <><form action={runFollowupsNow}><SubmitButton>Draft follow-ups now</SubmitButton></form><form action={runInboxNow}><SubmitButton>Check inbox now</SubmitButton></form></>} />
      {error && <Notice tone="bad">{error}</Notice>}
      {sending > 0 && <Notice tone="info">{sending} message(s) approved and sending.</Notice>}

      <div className="mb-4 flex gap-1 border-b border-line">
        {tabs.map(([k, l, n]) => (
          <Link key={k} href={`/app/outreach?tab=${k}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand font-medium text-brand" : "border-transparent text-muted"}`}>{l} <span className="badge ml-1">{n}</span></Link>
        ))}
      </div>

      {tab === "approve" && (
        <>
          {ctx.canWrite && jobs.length > 0 && (
            <form action={bulkDraft} className="card mb-6 grid items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <div><label className="label">Bulk-draft for role</label><select name="jobOrderId" className="input">{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select></div>
              <div><label className="label">Channel</label><select name="channel" className="input"><option value="EMAIL">Email</option><option value="SMS">SMS</option><option value="LINKEDIN">LinkedIn InMail</option></select></div>
              <div><label className="label">Min score</label><input name="minScore" type="number" defaultValue={65} className="input" /></div>
              <div><label className="label">Max drafts</label><input name="limit" type="number" defaultValue={20} max={50} className="input" /></div>
              <SubmitButton className="btn-primary">Draft</SubmitButton>
            </form>
          )}
          {drafts.length === 0 ? <Empty title="Nothing waiting">Draft a message from a candidate page, or bulk-draft for a role above.</Empty> : (
            <div className="space-y-4">
              {drafts.map((m) => (
                <div key={m.id} className={`card ${focus === m.id ? "ring-2 ring-brand" : ""}`}>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <Link href={whoHref(m)} className="font-semibold hover:underline">{who(m)}</Link><Badge>{m.channel.toLowerCase()}</Badge><StatusBadge s={m.status} /><Badge>{m.kind}</Badge>
                    <span className="muted text-xs">{fmtDate(m.createdAt)}</span>
                  </div>
                  {m.status === "FAILED" && <p className="mb-2 text-sm text-bad">Send failed: {m.error}</p>}
                  <form action={updateDraft.bind(null, m.id)} className="space-y-2">
                    {m.channel !== "SMS" && <input name="subject" defaultValue={m.subject ?? ""} className="input" aria-label="Subject" placeholder="Subject" disabled={!ctx.canWrite || m.status !== "DRAFT"} />}
                    <textarea name="body" defaultValue={m.body} className="input min-h-36" aria-label="Message" disabled={!ctx.canWrite || m.status !== "DRAFT"} />
                    {ctx.canWrite && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex gap-2">
                          {m.status === "DRAFT" && <SubmitButton className="btn-sm">Save edits</SubmitButton>}
                          {m.status === "DRAFT" && <button formAction={discardDraft.bind(null, m.id) as any} className="btn btn-sm" formNoValidate>Discard</button>}
                        </div>
                        <button formAction={approveAndSend.bind(null, m.id) as any} className="btn btn-primary btn-sm" formNoValidate>{m.status === "FAILED" ? "Approve & retry" : "Approve & send"}</button>
                      </div>
                    )}
                  </form>
                  {m.channel === "SMS" && <p className="muted mt-1 text-xs">{m.body.length}/320 characters</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "sent" && (sent.length === 0 ? <Empty title="No sent messages yet" /> : (
        <div className="card overflow-x-auto p-0"><table className="tbl"><thead><tr><th>To</th><th>Channel</th><th>Message</th><th>Sent</th><th /></tr></thead><tbody>
          {sent.map((m) => (
            <tr key={m.id}><td><Link href={whoHref(m)} className="font-medium">{who(m)}</Link></td><td><Badge>{m.channel.toLowerCase()}</Badge></td><td className="max-w-md"><div className="font-medium">{m.subject}</div><div className="muted line-clamp-2 text-xs">{m.body}</div></td><td className="muted whitespace-nowrap text-xs">{fmtDate(m.sentAt)}</td>
              <td className="text-right">{ctx.canWrite && m.candidateId && <form action={draftFollowup.bind(null, m.id)}><SubmitButton className="btn-sm">Follow up</SubmitButton></form>}</td></tr>
          ))}
        </tbody></table></div>
      ))}

      {tab === "replies" && (replies.length === 0 ? <Empty title="No replies yet">Replies appear here after the inbox watch runs. Safe suggested responses are saved as drafts for you to approve.</Empty> : (
        <div className="space-y-3">
          {replies.map((m) => (
            <div key={m.id} className="card">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm"><Link href={whoHref(m)} className="font-semibold">{who(m)}</Link><Badge>{m.channel.toLowerCase()}</Badge>{m.classification && <Badge tone={m.classification === "unsubscribe" ? "bad" : m.classification === "interested" ? "ok" : "info"}>{m.classification.replace("_", " ")}</Badge>}<span className="muted text-xs">{fmtDate(m.createdAt)}</span></div>
              <p className="whitespace-pre-wrap text-sm">{m.body.slice(0, 1200)}</p>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
