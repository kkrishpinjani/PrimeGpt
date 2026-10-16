import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { LiveRun } from "@/components/live-run";
import { cancelRun } from "../../actions/recruiting";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Run" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const run = await ctx.db.run.findFirst({ where: { id }, include: { events: { orderBy: { createdAt: "asc" }, take: 300 } } });
  if (!run) notFound();
  const candidates = run.type === "SOURCING" ? await ctx.db.candidate.count({ where: { runId: id } }) : 0;
  const initial = {
    id: run.id, type: run.type, status: run.status, progress: run.progress, summary: run.summary, error: run.error, needsHuman: run.needsHuman, candidates,
    events: run.events.map((e) => ({ at: e.createdAt.toISOString(), level: e.level, message: e.message })),
  };
  return (
    <>
      <PageHeader
        title={run.type.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
        subtitle="Runs happen in the background. You can leave this page; results are saved."
        actions={["QUEUED", "NEEDS_HUMAN"].includes(run.status) && ctx.canWrite ? <form action={cancelRun.bind(null, run.id)}><SubmitButton>Cancel</SubmitButton></form> : undefined}
      />
      <LiveRun runId={run.id} initial={initial} />
    </>
  );
}
