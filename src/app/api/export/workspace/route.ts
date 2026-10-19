import { apiCtx, apiError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { allow } from "@/lib/memory-ratelimit";

/** Full workspace export (data portability). Excludes secrets: integration credentials, device tokens, password hashes. */
export async function GET() {
  try {
    const ctx = await apiCtx({ minRole: "ADMIN" });
    if (!allow(`export:${ctx.tenant.id}`, 5, 600_000)) return Response.json({ error: "Export limit reached; try again in a few minutes" }, { status: 429 });
    const db = ctx.db;
    const [clients, jobOrders, candidates, contacts, messages, interviews, savedSearches, prospects, doNotContact, usage] = await Promise.all([
      db.client.findMany(), db.jobOrder.findMany(),
      db.candidate.findMany({ select: { id: true, fullName: true, headline: true, currentTitle: true, currentCompany: true, location: true, email: true, phone: true, linkedinUrl: true, source: true, summary: true, skills: true, fitScore: true, scoreRationale: true, brief: true, status: true, stage: true, notes: true, jobOrderId: true, createdAt: true } }),
      db.contact.findMany(), db.message.findMany(), db.interview.findMany(), db.savedSearch.findMany(), db.prospect.findMany(), db.doNotContact.findMany(),
      db.usageEvent.findMany({ select: { kind: true, quantity: true, costCents: true, createdAt: true } }),
    ]);
    await audit("workspace.exported", { tenantId: ctx.tenant.id, userId: ctx.user.id });
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), workspace: { name: ctx.tenant.name, slug: ctx.tenant.slug }, clients, jobOrders, candidates, contacts, messages, interviews, savedSearches, prospects, doNotContact, usage }, null, 2);
    return new Response(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${ctx.tenant.slug}-export.json"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
