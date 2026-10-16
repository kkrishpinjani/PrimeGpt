"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCtx, ROLE_RANK } from "@/lib/auth";
import { pairingCode, randomToken } from "@/lib/crypto";
import { removeSecret, saveSecret, type Provider } from "@/lib/integrations/store";
import { audit } from "@/lib/audit";
import { sendSystemEmail } from "@/lib/mailer";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

export async function updateWorkspace(f: FormData) {
  const ctx = await requireCtx({ minRole: "ADMIN" });
  const color = s(f, "brandColor");
  await prisma.tenant.update({
    where: { id: ctx.tenant.id },
    data: {
      name: s(f, "name") ?? ctx.tenant.name,
      brandName: s(f, "brandName") ?? null,
      brandColor: color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null,
      brandLogoUrl: s(f, "brandLogoUrl")?.startsWith("https://") ? s(f, "brandLogoUrl") : null,
      autonomyInboxWatch: f.get("autonomyInboxWatch") === "on",
      aiMonthlyBudgetCents: Math.max(0, Math.round(Number(s(f, "aiBudgetDollars") ?? "200") * 100)),
    },
  });
  await audit("workspace.updated", { tenantId: ctx.tenant.id, userId: ctx.user.id });
  revalidatePath("/app", "layout");
}

// ───── team ─────
export async function inviteMember(f: FormData) {
  const ctx = await requireCtx({ minRole: "ADMIN" });
  const email = z.string().email().parse(s(f, "email")).toLowerCase();
  const role = z.enum(["ADMIN", "RECRUITER", "VIEWER"]).parse(s(f, "role") ?? "RECRUITER") as Role;
  const token = randomToken(24);
  await prisma.invite.create({ data: { tenantId: ctx.tenant.id, email, role, token, expiresAt: new Date(Date.now() + 7 * 864e5) } });
  await audit("member.invited", { tenantId: ctx.tenant.id, userId: ctx.user.id, detail: email });
  const link = `${process.env.APP_URL}/signup?invite=${token}`;
  const mailed = await sendSystemEmail(
    email,
    `${ctx.user.name} invited you to ${ctx.tenant.brandName ?? ctx.tenant.name} on RecruitGPT`,
    `${ctx.user.name} invited you to join ${ctx.tenant.brandName ?? ctx.tenant.name} on RecruitGPT.ai as ${role.toLowerCase()}.\n\nAccept the invite (valid 7 days):\n${link}\n`,
  );
  redirect(`/app/team?invite=${token}${mailed ? "&mailed=1" : ""}`);
}

export async function changeRole(membershipId: string, role: Role) {
  const ctx = await requireCtx({ minRole: "OWNER" });
  const m = await prisma.membership.findFirst({ where: { id: membershipId, tenantId: ctx.tenant.id } });
  if (!m || m.userId === ctx.user.id) throw new Error("Cannot change your own role");
  await prisma.membership.update({ where: { id: m.id }, data: { role } });
  revalidatePath("/app/team");
}

export async function removeMember(membershipId: string) {
  const ctx = await requireCtx({ minRole: "ADMIN" });
  const m = await prisma.membership.findFirst({ where: { id: membershipId, tenantId: ctx.tenant.id } });
  if (!m || m.userId === ctx.user.id) throw new Error("Cannot remove yourself");
  if (ROLE_RANK[m.role] >= ROLE_RANK[ctx.role]) throw new Error("Insufficient role");
  await prisma.membership.delete({ where: { id: m.id } });
  revalidatePath("/app/team");
}

// ───── local helper (WS5) ─────
export async function createPairingCode(f: FormData) {
  const ctx = await requireCtx({ minRole: "ADMIN" });
  const dev = await ctx.db.executorDevice.create({
    data: { tenantId: ctx.tenant.id, label: s(f, "label") ?? "My computer", pairingCode: pairingCode(), pairingExpires: new Date(Date.now() + 15 * 60_000) },
  });
  revalidatePath("/app/integrations");
  redirect(`/app/integrations?code=${dev.pairingCode}`);
}

export async function revokeDevice(id: string) {
  const ctx = await requireCtx({ minRole: "ADMIN" });
  await ctx.db.executorDevice.updateMany({ where: { id }, data: { revokedAt: new Date(), tokenHash: null, pairingCode: null, online: false } });
  await audit("executor.revoked", { tenantId: ctx.tenant.id, userId: ctx.user.id, detail: id });
  revalidatePath("/app/integrations");
}

// ───── integrations (per tenant, encrypted) ─────
export async function saveQuo(f: FormData) {
  const ctx = await requireCtx({ minRole: "ADMIN" });
  const apiKey = z.string().min(8).parse(s(f, "apiKey"));
  await saveSecret(ctx.tenant.id, "quo", { apiKey, phoneNumberId: s(f, "phoneNumberId") ?? "", from: s(f, "from") ?? "" }, s(f, "from"));
  revalidatePath("/app/integrations");
}

export async function saveByoKey(provider: "apollo" | "exa", f: FormData) {
  const ctx = await requireCtx({ minRole: "ADMIN" });
  await saveSecret(ctx.tenant.id, provider, { apiKey: z.string().min(8).parse(s(f, "apiKey")) });
  revalidatePath("/app/integrations");
}

export async function disconnect(provider: Provider) {
  const ctx = await requireCtx({ minRole: "ADMIN" });
  await removeSecret(ctx.tenant.id, provider);
  if (provider === "gmail") await removeSecret(ctx.tenant.id, "gcalendar");
  await audit("integration.disconnected", { tenantId: ctx.tenant.id, userId: ctx.user.id, detail: provider });
  revalidatePath("/app/integrations");
}
