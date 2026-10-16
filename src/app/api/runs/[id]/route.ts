import { apiCtx, apiError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await apiCtx();
    const { id } = await params;
    const run = await ctx.db.run.findFirst({ where: { id }, include: { events: { orderBy: { createdAt: "asc" }, take: 300 } } });
    if (!run) return Response.json({ error: "Not found" }, { status: 404 });
    const candidates = run.type === "SOURCING" ? await ctx.db.candidate.count({ where: { runId: id } }) : 0;
    return Response.json({
      id: run.id, type: run.type, status: run.status, progress: run.progress, summary: run.summary, error: run.error, needsHuman: run.needsHuman, candidates,
      events: run.events.map((e) => ({ at: e.createdAt, level: e.level, message: e.message })),
    });
  } catch (e) {
    return apiError(e);
  }
}
