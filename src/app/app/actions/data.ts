"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { destroySession, requireCtx } from "@/lib/auth";
import { normPhone } from "@/lib/brain/rules";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { audit } from "@/lib/audit";
import { eraseCandidate } from "@/lib/services/erasure";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

export async function updateCandidate(id: string, f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await ctx.db.candidate.update({
    where: { id },
    data: {
      fullName: z.string().min(1).max(190).parse(s(f, "fullName")),
      headline: s(f, "headline") ?? null, currentTitle: s(f, "currentTitle") ?? null, currentCompany: s(f, "currentCompany") ?? null, location: s(f, "location") ?? null,
      email: s(f, "email")?.toLowerCase() ?? null, phone: s(f, "phone") ? normPhone(s(f, "phone")!) : null, linkedinUrl: s(f, "linkedinUrl") ?? null,
      summary: s(f, "summary") ?? null, skills: s(f, "skills") ?? null,
    },
  });
  revalidatePath(`/app/candidates/${id}`);
}

/** Erasure (privacy policy): see eraseCandidate. */
export async function deleteCandidate(id: string, f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await eraseCandidate(ctx.tenant.id, id, f.get("keepDnc") === "on");
  await audit("candidate.deleted", { tenantId: ctx.tenant.id, userId: ctx.user.id, detail: id });
  revalidatePath("/app/candidates");
  redirect("/app/candidates?deleted=1");
}

/** Owner-only, typed confirmation. Cancels the Stripe subscription first, then cascades every workspace row. */
export async function deleteWorkspace(f: FormData) {
  const ctx = await requireCtx({ minRole: "OWNER" });
  if (s(f, "confirm") !== ctx.tenant.slug) redirect("/app/settings?error=" + encodeURIComponent("Type the workspace slug exactly to confirm"));
  if (stripeConfigured() && ctx.tenant.stripeSubscriptionId) {
    try { await stripe().subscriptions.cancel(ctx.tenant.stripeSubscriptionId); } catch (e) { console.error("[deleteWorkspace] stripe cancel failed", (e as Error).message); }
  }
  await audit("workspace.deleted", { tenantId: null, userId: ctx.user.id, detail: `${ctx.tenant.slug} (${ctx.tenant.id})` });
  await prisma.tenant.delete({ where: { id: ctx.tenant.id } });
  await destroySession();
  redirect("/?deleted=1");
}
