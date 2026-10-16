import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { tdb } from "@/lib/tenant-db";

/** The isolation gate (WS1): a workspace can never read or modify another workspace's rows. */
const mk = (slug: string) => prisma.tenant.create({ data: { name: slug, slug: `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });

test("tenant isolation", async (t) => {
  const A = await mk("iso-a"), B = await mk("iso-b");
  const a = tdb(A.id), b = tdb(B.id);
  const ca = await a.candidate.create({ data: { tenantId: A.id, fullName: "Alice A", source: "manual", sourceRef: "a1" } });
  const cb = await b.candidate.create({ data: { tenantId: B.id, fullName: "Bob B", source: "manual", sourceRef: "b1" } });

  await t.test("reads are scoped", async () => {
    assert.equal((await a.candidate.findMany()).length, 1);
    assert.equal(await a.candidate.findFirst({ where: { id: cb.id } }), null);
    assert.equal(await a.candidate.findUnique({ where: { id: cb.id } }), null);
    assert.equal(await a.candidate.count(), 1);
  });
  await t.test("create injects the tenant even if caller lies", async () => {
    const x = await a.candidate.create({ data: { tenantId: B.id, fullName: "Sneaky", source: "manual", sourceRef: "s1" } });
    assert.equal(x.tenantId, A.id);
  });
  await t.test("cross-tenant update/delete are no-ops", async () => {
    assert.equal((await a.candidate.updateMany({ where: { id: cb.id }, data: { fullName: "pwned" } })).count, 0);
    assert.equal((await a.candidate.deleteMany({ where: { id: cb.id } })).count, 0);
    await assert.rejects(() => a.candidate.update({ where: { id: cb.id }, data: { fullName: "pwned" } }));
    await assert.rejects(() => a.candidate.delete({ where: { id: cb.id } }));
    assert.equal((await prisma.candidate.findUnique({ where: { id: cb.id } }))!.fullName, "Bob B");
  });
  await t.test("tenant hopping via update is stripped", async () => {
    await a.candidate.update({ where: { id: ca.id }, data: { tenantId: B.id, fullName: "Alice 2" } as any });
    assert.equal((await prisma.candidate.findUnique({ where: { id: ca.id } }))!.tenantId, A.id);
  });
  await t.test("other models are scoped too", async () => {
    await b.message.create({ data: { tenantId: B.id, channel: "EMAIL", body: "secret" } });
    assert.equal(await a.message.count(), 0);
    await b.jobOrder.create({ data: { tenantId: B.id, title: "B role" } });
    assert.equal((await a.jobOrder.findMany()).length, 0);
  });
  await t.test("tdb requires a tenant id", () => assert.throws(() => tdb("")));

  await prisma.tenant.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  await prisma.$disconnect();
});
