"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { sendSystemEmail } from "@/lib/mailer";
import { audit } from "@/lib/audit";

/** Subscription is the funnel, expert human-led service is the upsell (scope §2). Any member can ask for help. */
export async function createExpertRequest(f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  const d = z.object({
    kind: z.enum(["talent_search", "coaching", "other"]),
    message: z.string().min(10, "Tell us a little about what you need").max(4000),
  }).parse({ kind: f.get("kind"), message: String(f.get("message") ?? "").trim() });
  const r = await prisma.expertRequest.create({ data: { tenantId: ctx.tenant.id, userId: ctx.user.id, kind: d.kind, message: d.message } });
  await audit("expert.requested", { tenantId: ctx.tenant.id, userId: ctx.user.id, detail: d.kind });
  if (process.env.EXPERT_REQUESTS_EMAIL) {
    await sendSystemEmail(
      process.env.EXPERT_REQUESTS_EMAIL,
      `Expert help request from ${ctx.tenant.name}`,
      `${ctx.user.name} <${ctx.user.email}> at ${ctx.tenant.name} asked for: ${d.kind}\n\n${d.message}\n\nRequest id: ${r.id}`,
    );
  }
  revalidatePath("/app/expert-help");
  redirect("/app/expert-help?sent=1");
}

export async function setExpertRequestStatus(id: string, status: "new" | "contacted" | "closed") {
  const ctx = await requireCtx();
  if (!ctx.user.isPlatformAdmin) redirect("/app?denied=1");
  await prisma.expertRequest.update({ where: { id }, data: { status } });
  revalidatePath("/app/admin");
}
