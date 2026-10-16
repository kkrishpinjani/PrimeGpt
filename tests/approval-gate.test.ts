import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { runSend } from "../worker/jobs/send";

/** The approval gate and do-not-contact are enforced at the single send choke point. */
test("send pipeline refuses unapproved and do-not-contact messages", async (t) => {
  const tenant = await prisma.tenant.create({ data: { name: "gate", slug: `gate-${Date.now()}`, subscriptionStatus: "ACTIVE" } });
  const user = await prisma.user.create({ data: { email: `gate-${Date.now()}@test.local`, name: "G", passwordHash: "x" } });
  const cand = await prisma.candidate.create({ data: { tenantId: tenant.id, fullName: "Dee", email: "dee@example.com", source: "manual", sourceRef: "d1" } });
  const mkRun = (messageId: string) => ({ id: "r", tenantId: tenant.id, params: { messageId } }) as any;

  await t.test("DRAFT cannot be sent", async () => {
    const m = await prisma.message.create({ data: { tenantId: tenant.id, candidateId: cand.id, channel: "EMAIL", subject: "s", body: "b", status: "DRAFT" } });
    await assert.rejects(() => runSend(mkRun(m.id)), /only APPROVED/);
    assert.equal((await prisma.message.findUnique({ where: { id: m.id } }))!.status, "DRAFT");
  });
  await t.test("APPROVED without an approval record cannot be sent", async () => {
    const m = await prisma.message.create({ data: { tenantId: tenant.id, candidateId: cand.id, channel: "EMAIL", subject: "s", body: "b", status: "APPROVED" } });
    await assert.rejects(() => runSend(mkRun(m.id)), /no approval record/);
  });
  await t.test("do-not-contact is re-checked at send time", async () => {
    await prisma.doNotContact.create({ data: { tenantId: tenant.id, email: "dee@example.com", reason: "test" } });
    const m = await prisma.message.create({ data: { tenantId: tenant.id, candidateId: cand.id, channel: "EMAIL", subject: "s", body: "b", status: "APPROVED", approvedById: user.id, approvedAt: new Date() } });
    await assert.rejects(() => runSend(mkRun(m.id)), /do-not-contact/);
    assert.equal((await prisma.message.findUnique({ where: { id: m.id } }))!.status, "FAILED");
  });
  await t.test("inactive subscription blocks sending", async () => {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { subscriptionStatus: "CANCELED" } });
    const m = await prisma.message.create({ data: { tenantId: tenant.id, candidateId: cand.id, channel: "EMAIL", subject: "s", body: "b", status: "APPROVED", approvedById: user.id, approvedAt: new Date() } });
    await assert.rejects(() => runSend(mkRun(m.id)), /not active/);
  });

  await prisma.tenant.delete({ where: { id: tenant.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
});
