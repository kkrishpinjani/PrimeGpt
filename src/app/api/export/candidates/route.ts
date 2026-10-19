import { apiCtx, apiError } from "@/lib/auth";
import { csvCell as esc } from "@/lib/csv";

export async function GET() {
  try {
    const ctx = await apiCtx({ minRole: "RECRUITER" });
    const rows = await ctx.db.candidate.findMany({ orderBy: { createdAt: "asc" }, include: { jobOrder: true } });
    const cols = ["full_name", "title", "company", "location", "email", "phone", "linkedin_url", "source", "status", "fit_score", "role", "summary", "skills", "notes", "created_at"];
    const lines = [cols.join(",")];
    for (const c of rows) {
      lines.push([c.fullName, c.currentTitle, c.currentCompany, c.location, c.email, c.phone, c.linkedinUrl, c.source, c.status, c.fitScore, c.jobOrder?.title, c.summary, c.skills, c.notes, c.createdAt.toISOString()].map(esc).join(","));
    }
    return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="candidates.csv"', "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
