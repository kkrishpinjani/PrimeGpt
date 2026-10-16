import { apiCtx, apiError } from "@/lib/auth";
import { briefDocx, comparisonXlsx } from "@/lib/services/documents";

/** GET /api/documents/<id>?kind=brief|compare|shortlist  (id = candidateId, comma-separated candidate ids, or jobOrderId) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await apiCtx({ needSubscription: true });
    const { id } = await params;
    const kind = new URL(req.url).searchParams.get("kind") ?? "brief";
    const firm = ctx.tenant.brandName ?? ctx.tenant.name;
    let buf: Buffer, name: string, type: string, format: string;
    if (kind === "brief") {
      const c = await ctx.db.candidate.findFirst({ where: { id }, include: { jobOrder: true } });
      if (!c) return Response.json({ error: "Not found" }, { status: 404 });
      buf = await briefDocx(c, c.jobOrder, firm);
      name = `Brief - ${c.fullName}.docx`;
      format = "docx";
      type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      const ids = id.split(",");
      const where = kind === "shortlist" ? { jobOrderId: id, status: { not: "REJECTED" as const } } : { id: { in: ids } };
      const cands = await ctx.db.candidate.findMany({ where, orderBy: { fitScore: "desc" }, take: 200 });
      const job = kind === "shortlist" ? await ctx.db.jobOrder.findFirst({ where: { id } }) : null;
      buf = await comparisonXlsx(cands, job);
      name = kind === "shortlist" ? `Shortlist - ${job?.title ?? "role"}.xlsx` : "Candidate comparison.xlsx";
      format = "xlsx";
      type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    await ctx.db.document.create({ data: { tenantId: ctx.tenant.id, kind, title: name, format, data: new Uint8Array(buf) } });
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` },
    });
  } catch (e) {
    return apiError(e);
  }
}
