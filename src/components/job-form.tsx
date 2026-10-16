import type { Client, JobOrder } from "@prisma/client";
import { SubmitButton } from "./submit-button";

export function JobForm({ action, job, clients, submit }: { action: (f: FormData) => void | Promise<void>; job?: JobOrder; clients?: Client[]; submit: string }) {
  return (
    <form action={action} className="card max-w-3xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Title *</label><input name="title" required defaultValue={job?.title} className="input" /></div>
        {clients && <div><label className="label">Client</label><select name="clientId" defaultValue={job?.clientId ?? ""} className="input"><option value="">None (internal / own hire)</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        <div><label className="label">Location</label><input name="location" defaultValue={job?.location ?? ""} className="input" /></div>
        {job && <div><label className="label">Status</label><select name="status" defaultValue={job.status} className="input"><option value="open">open</option><option value="on_hold">on hold</option><option value="filled">filled</option><option value="closed">closed</option></select></div>}
        <div className="sm:col-span-2"><label className="label">Description</label><textarea name="description" defaultValue={job?.description ?? ""} className="input" /></div>
        <div><label className="label">Must-haves (one per line)</label><textarea name="mustHaves" defaultValue={job?.mustHaves ?? ""} className="input min-h-32" /></div>
        <div><label className="label">Nice-to-haves (one per line)</label><textarea name="niceToHaves" defaultValue={job?.niceToHaves ?? ""} className="input min-h-32" /></div>
        <div><label className="label">Comp min (USD)</label><input name="compMin" type="number" defaultValue={job?.compMin ?? ""} className="input" /></div>
        <div><label className="label">Comp max (USD)</label><input name="compMax" type="number" defaultValue={job?.compMax ?? ""} className="input" /></div>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="discloseComp" defaultChecked={job?.discloseComp} className="mt-1" /><span>Allow compensation to be mentioned in outreach<br /><span className="muted text-xs">Off by default. When off, outreach can never mention pay.</span></span></label>
      <SubmitButton className="btn-primary">{submit}</SubmitButton>
    </form>
  );
}
