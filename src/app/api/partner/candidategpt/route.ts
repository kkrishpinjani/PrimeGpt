import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { upsertCandidate } from "@/lib/services/candidates";

/**
 * "Two applications, one system": CandidateGPT.ai can hand an opted-in job seeker to a RecruitGPT workspace.
 * Server-to-server only, HMAC-signed with PARTNER_SHARED_SECRET. The two apps stay separate products.
 */
const body = z.object({
  tenantSlug: z.string(),
  jobOrderId: z.string().optional(),
  candidate: z.object({
    externalId: z.string(),
    fullName: z.string(),
    headline: z.string().optional(),
    location: z.string().optional(),
    email: z.string().email().optional(),
    linkedinUrl: z.string().url().optional(),
    summary: z.string().optional(),
    skills: z.string().optional(),
    consentToShare: z.literal(true), // the job seeker must have opted in on CandidateGPT
  }),
});

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-signature") ?? "";
  const expect = crypto.createHmac("sha256", process.env.PARTNER_SHARED_SECRET ?? "").update(raw).digest("hex");
  if (!process.env.PARTNER_SHARED_SECRET || !safeEqual(sig, expect)) return new Response("unauthorized", { status: 401 });
  const parsed = body.safeParse(JSON.parse(raw));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const t = await prisma.tenant.findUnique({ where: { slug: parsed.data.tenantSlug } });
  if (!t) return Response.json({ error: "unknown workspace" }, { status: 404 });
  const { externalId, consentToShare: _c, ...c } = parsed.data.candidate;
  const [row, isNew] = await upsertCandidate(t.id, { ...c, source: "candidategpt", sourceRef: externalId }, { jobOrderId: parsed.data.jobOrderId });
  return Response.json({ id: row.id, created: isNew });
}
