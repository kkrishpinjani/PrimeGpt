import { requireCtx } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { JobForm } from "@/components/job-form";
import { createJobOrder } from "../../actions/recruiting";

export const metadata = { title: "New role" };

export default async function NewJob() {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  const clients = await ctx.db.client.findMany({ orderBy: { name: "asc" } });
  return (<><PageHeader title="New role" /><JobForm action={createJobOrder} clients={clients} submit="Create role" /></>);
}
