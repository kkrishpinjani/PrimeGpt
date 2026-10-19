"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { TenantKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { pairingCode } from "@/lib/crypto";
import { audit } from "@/lib/audit";

/** Platform-operator actions. Gated on User.isPlatformAdmin, not on any workspace role. */
async function platformAdmin() {
  const ctx = await requireCtx();
  if (!ctx.user.isPlatformAdmin) redirect("/app?denied=1");
  return ctx;
}

export async function setTenantKind(tenantId: string, kind: TenantKind) {
  const ctx = await platformAdmin();
  await prisma.tenant.update({ where: { id: tenantId }, data: { kind } });
  await audit("admin.tenant_kind", { tenantId, userId: ctx.user.id, detail: kind });
  revalidatePath("/app/admin");
}

export async function setPassThrough(tenantId: string, on: boolean) {
  const ctx = await platformAdmin();
  await prisma.tenant.update({ where: { id: tenantId }, data: { passThroughUsage: on } });
  await audit("admin.pass_through", { tenantId, userId: ctx.user.id, detail: String(on) });
  revalidatePath("/app/admin");
}

/** Creates a MANAGED device and returns its single-use pairing code to paste into the hosted helper container (RGPT_PAIR_CODE). */
export async function provisionManagedDevice(tenantId: string) {
  const ctx = await platformAdmin();
  const dev = await prisma.executorDevice.create({
    data: { tenantId, kind: "managed", label: "Managed session", pairingCode: pairingCode(), pairingExpires: new Date(Date.now() + 24 * 3600_000) },
  });
  await prisma.tenant.update({ where: { id: tenantId }, data: { managedSessionRequested: false } });
  await audit("admin.managed_provisioned", { tenantId, userId: ctx.user.id, detail: dev.id });
  redirect(`/app/admin?code=${dev.pairingCode}&tenant=${tenantId}`);
}

/** A workspace admin asks for a hosted browser session (for customers who cannot run the helper themselves). */
export async function requestManagedSession() {
  const ctx = await requireCtx({ minRole: "ADMIN" });
  await prisma.tenant.update({ where: { id: ctx.tenant.id }, data: { managedSessionRequested: true } });
  await audit("managed_session.requested", { tenantId: ctx.tenant.id, userId: ctx.user.id });
  revalidatePath("/app/integrations");
}
