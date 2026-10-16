import { requireCtx } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addCandidate } from "../../actions/recruiting";

export const metadata = { title: "Add candidate" };

export default async function NewCandidate() {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  const jobs = await ctx.db.jobOrder.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Add candidate" subtitle="Paste profile text to get a better score and brief." />
      <form action={addCandidate} className="card max-w-3xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Full name *</label><input name="fullName" required className="input" /></div>
          <div><label className="label">Role (scores on save)</label><select name="jobOrderId" className="input"><option value="">None</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select></div>
          <div><label className="label">Current title</label><input name="currentTitle" className="input" /></div>
          <div><label className="label">Current company</label><input name="currentCompany" className="input" /></div>
          <div><label className="label">Location</label><input name="location" className="input" /></div>
          <div><label className="label">Headline</label><input name="headline" className="input" /></div>
          <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
          <div><label className="label">Phone</label><input name="phone" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">LinkedIn URL</label><input name="linkedinUrl" type="url" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Skills (comma separated)</label><input name="skills" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Summary</label><textarea name="summary" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Full profile / resume text</label><textarea name="rawProfile" className="input min-h-40" /></div>
        </div>
        <SubmitButton className="btn-primary">Save candidate</SubmitButton>
      </form>
    </>
  );
}
