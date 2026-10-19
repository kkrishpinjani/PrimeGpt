"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prospect } from "@prisma/client";
import { requireCtx } from "@/lib/auth";
import { draftProspectIntro } from "@/lib/brain/prospect";
import { isDoNotContact, normPhone } from "@/lib/brain/rules";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

export async function createContact(f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  const fullName = z.string().min(1).max(190).parse(s(f, "fullName"));
  const c = await ctx.db.contact.create({
    data: { tenantId: ctx.tenant.id, fullName, title: s(f, "title"), email: s(f, "email")?.toLowerCase(), phone: s(f, "phone") ? normPhone(s(f, "phone")!) : undefined, linkedinUrl: s(f, "linkedinUrl"), clientId: s(f, "clientId"), source: "manual" },
  });
  revalidatePath("/app/contacts");
  redirect(`/app/contacts/${c.id}`);
}

export async function updateContact(id: string, f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await ctx.db.contact.update({
    where: { id },
    data: {
      fullName: s(f, "fullName"), title: s(f, "title") ?? null, email: s(f, "email")?.toLowerCase() ?? null,
      phone: s(f, "phone") ? normPhone(s(f, "phone")!) : null, linkedinUrl: s(f, "linkedinUrl") ?? null, clientId: s(f, "clientId") ?? null,
    },
  });
  revalidatePath(`/app/contacts/${id}`);
}

export async function deleteContact(id: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await ctx.db.message.deleteMany({ where: { contactId: id, status: "DRAFT" } });
  await ctx.db.contact.deleteMany({ where: { id } });
  redirect("/app/contacts");
}

export async function updateClient(id: string, f: FormData) {
  const ctx = await requireCtx({ minRole: "RECRUITER" });
  await ctx.db.client.update({
    where: { id },
    data: { name: s(f, "name"), industry: s(f, "industry") ?? null, website: s(f, "website") ?? null, notes: s(f, "notes") ?? null, status: s(f, "status") ?? "active" },
  });
  revalidatePath(`/app/clients/${id}`);
  revalidatePath("/app/clients");
}

/** Draft an intro email to a client contact. Lands in Outreach as a DRAFT: still needs approval. */
export async function draftContactEmail(contactId: string) {
  const ctx = await requireCtx({ minRole: "RECRUITER", needSubscription: true });
  const c = await ctx.db.contact.findFirst({ where: { id: contactId }, include: { client: true } });
  if (!c) throw new Error("Contact not found");
  if (!c.email) redirect(`/app/contacts/${contactId}?error=${encodeURIComponent("Add an email address first")}`);
  if (await isDoNotContact(ctx.tenant.id, c)) redirect(`/app/contacts/${contactId}?error=${encodeURIComponent("This contact is on the do-not-contact list")}`);
  const intro = await draftProspectIntro(ctx.tenant, ctx.user.name, {
    company: c.client?.name ?? "your company", domain: c.client?.website ?? null, contactName: c.fullName, contactTitle: c.title, rationale: c.client?.notes ?? null,
  } as unknown as Prospect);
  const m = await ctx.db.message.create({
    data: { tenantId: ctx.tenant.id, contactId: c.id, channel: "EMAIL", direction: "OUTBOUND", status: "DRAFT", kind: "outreach", subject: intro.subject, body: intro.body },
  });
  redirect(`/app/outreach?focus=${m.id}`);
}
