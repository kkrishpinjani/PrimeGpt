import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { prisma } from "@/lib/db";
import { runFollowupDraft } from "../worker/jobs/followups";
import { billUsageForTenant, computeUsageCharges, monthKey, previousMonthKey } from "@/lib/usage-billing";
import { getPlans, isPriced } from "@/lib/plans";
import { checkoutLineItems } from "@/lib/stripe";

const slug = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

test("follow-up drafts: after silence, never auto-sent, capped, idempotent", async (t) => {
  const tenant = await prisma.tenant.create({ data: { name: "fu", slug: slug("fu"), subscriptionStatus: "ACTIVE", autonomyFollowups: true, followupDays: 3, maxFollowups: 1 } });
  const mk = (name: string, status: any = "CONTACTED") =>
    prisma.candidate.create({ data: { tenantId: tenant.id, fullName: name, email: `${name.replace(/\s/g, "").toLowerCase()}@x.com`, source: "manual", sourceRef: name, status } });
  const sent = (candidateId: string, ago: number) =>
    prisma.message.create({ data: { tenantId: tenant.id, candidateId, channel: "EMAIL", subject: "Role", body: "Hi", status: "SENT", kind: "outreach", sentAt: daysAgo(ago) } });
  const silent = await mk("Silent One");
  const fresh = await mk("Fresh One");
  const replied = await mk("Replied One", "REPLIED");
  const answered = await mk("Answered One");
  const dnc = await mk("Blocked One");
  await sent(silent.id, 5);
  await sent(fresh.id, 1);
  await sent(replied.id, 5);
  const a = await sent(answered.id, 5);
  await prisma.message.create({
    data: { tenantId: tenant.id, candidateId: answered.id, channel: "EMAIL", body: "thanks", direction: "INBOUND", status: "RECEIVED", kind: "reply", createdAt: new Date(a.sentAt!.getTime() + 3600_000) },
  });
  await sent(dnc.id, 5);
  await prisma.doNotContact.create({ data: { tenantId: tenant.id, email: "blockedone@x.com" } });

  const run = { id: "none", tenantId: tenant.id, params: {} } as any;
  await t.test("creates a draft only for the silent, contactable person", async () => {
    await runFollowupDraft(run);
    const drafts = await prisma.message.findMany({ where: { tenantId: tenant.id, kind: "followup" }, include: { candidate: true } });
    assert.deepEqual(drafts.map((d) => d.candidate!.fullName), ["Silent One"]);
    assert.equal(drafts[0].status, "DRAFT", "follow-ups are drafts, never sent automatically");
    assert.equal(drafts[0].approvedById, null);
  });
  await t.test("running again creates nothing new (idempotent)", async () => {
    await runFollowupDraft(run);
    assert.equal(await prisma.message.count({ where: { tenantId: tenant.id, kind: "followup" } }), 1);
  });
  await t.test("max follow-ups per person is respected", async () => {
    await prisma.message.updateMany({ where: { tenantId: tenant.id, kind: "followup" }, data: { status: "SENT", sentAt: daysAgo(5) } });
    await runFollowupDraft(run);
    assert.equal(await prisma.message.count({ where: { tenantId: tenant.id, kind: "followup" } }), 1, "maxFollowups=1 reached");
  });
  await prisma.tenant.delete({ where: { id: tenant.id } });
});

test("usage billing: correct amounts, off by default, never double-charges", async () => {
  process.env.USAGE_INMAIL_CENTS = "50";
  const tenant = await prisma.tenant.create({ data: { name: "ub", slug: slug("ub"), stripeCustomerId: "cus_test", passThroughUsage: true } });
  const prev = previousMonthKey();
  const [y, m] = prev.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, 15, 12));
  await prisma.usageEvent.createMany({
    data: [
      { tenantId: tenant.id, kind: "ai_tokens", quantity: 1000, costCents: 40, createdAt: at },
      { tenantId: tenant.id, kind: "ai_tokens", quantity: 500, costCents: 25, createdAt: at },
      { tenantId: tenant.id, kind: "inmail", quantity: 1, createdAt: at },
      { tenantId: tenant.id, kind: "inmail", quantity: 1, createdAt: at },
      { tenantId: tenant.id, kind: "email", quantity: 1, createdAt: at }, // free by default
      { tenantId: tenant.id, kind: "ai_tokens", quantity: 9, costCents: 999, createdAt: new Date() }, // current month: not billed yet
    ],
  });
  const c = await computeUsageCharges(tenant.id, prev);
  assert.equal(c.totalCents, 65 + 100, "AI at cost (65c) + 2 InMail x 50c");
  const calls: any[] = [];
  const stub = { create: async (p: any, o: any) => { calls.push({ p, o }); } };
  const r1: any = await billUsageForTenant(tenant.id, prev, stub);
  assert.equal(r1.billed, 2);
  assert.ok(calls.every((x) => x.o.idempotencyKey.startsWith(`usage-${tenant.id}-${prev}-`)));
  const r2: any = await billUsageForTenant(tenant.id, prev, stub);
  assert.equal(r2.skipped, "already billed");
  assert.equal(calls.length, 2, "second run adds nothing");
  await prisma.tenant.update({ where: { id: tenant.id }, data: { passThroughUsage: false, lastUsageBilledMonth: null } });
  assert.equal(((await billUsageForTenant(tenant.id, prev, stub)) as any).skipped, "not enabled or no Stripe customer");
  assert.match(monthKey(new Date(Date.UTC(2026, 0, 5))), /^2026-01$/);
  delete process.env.USAGE_INMAIL_CENTS;
  await prisma.tenant.delete({ where: { id: tenant.id } });
});

test("plans: standard is the PDF price; solo/white-label are not invented", () => {
  delete process.env.PRICE_SOLO_MONTHLY_CENTS;
  delete process.env.PRICE_SOLO_SETUP_CENTS;
  const p = getPlans();
  assert.equal(p.STANDARD.setupCents, 100_000);
  assert.equal(p.STANDARD.monthlyCents, 150_000);
  assert.equal(isPriced(p.SOLO), false);
  assert.throws(() => checkoutLineItems("SOLO"), /no price configured/);
  process.env.PRICE_SOLO_SETUP_CENTS = "0";
  process.env.PRICE_SOLO_MONTHLY_CENTS = "50000";
  assert.equal(isPriced(getPlans().SOLO), true);
  const items: any = checkoutLineItems("SOLO");
  assert.equal(items[1].price_data.unit_amount, 50000);
  delete process.env.PRICE_SOLO_SETUP_CENTS;
  delete process.env.PRICE_SOLO_MONTHLY_CENTS;
});

test("legacy SQLite import: maps tables, skips legacy ones, dry-run writes nothing", async () => {
  const tenant = await prisma.tenant.create({ data: { name: "imp", slug: slug("imp") } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rgpt-import-"));
  const file = path.join(dir, "recruit.db");
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT, industry TEXT);
    CREATE TABLE job_orders (id INTEGER PRIMARY KEY, client_id INTEGER, title TEXT, location TEXT);
    CREATE TABLE candidates (id INTEGER PRIMARY KEY, full_name TEXT, title TEXT, company TEXT, location TEXT, email TEXT, linkedin_url TEXT, fit_score INTEGER, job_order_id INTEGER);
    CREATE TABLE messages (id INTEGER PRIMARY KEY, candidate_id INTEGER, channel TEXT, direction TEXT, subject TEXT, body TEXT, created_at TEXT);
    CREATE TABLE legacy_candidates_2024 (id INTEGER PRIMARY KEY, full_name TEXT);
    INSERT INTO clients VALUES (1,'Acme','Manufacturing');
    INSERT INTO job_orders VALUES (1,1,'CFO','Chicago');
    INSERT INTO candidates VALUES (1,'Ana Lopez','CFO','Globex','Chicago','ana@x.com','https://linkedin.com/in/ana',82,1),(2,'Bo Chen','Controller','Initech','Austin',NULL,NULL,55,1);
    INSERT INTO messages VALUES (1,1,'email','outbound','Hello','Hi Ana','2026-03-01'),(2,1,'sms','inbound',NULL,'Interested','2026-03-02');
    INSERT INTO legacy_candidates_2024 VALUES (1,'Old Person');
  `);
  db.close();
  const run = (extra: string[]) =>
    spawnSync(process.execPath, ["--env-file=.env", "--import", "tsx", "scripts/import-sqlite.ts", "--db", file, "--tenant", tenant.slug, ...extra], { encoding: "utf8", cwd: path.resolve(__dirname, "..") });

  const dry = run(["--dry-run"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /DRY RUN/);
  assert.equal(await prisma.candidate.count({ where: { tenantId: tenant.id } }), 0, "dry run writes nothing");

  const real = run([]);
  assert.equal(real.status, 0, real.stderr + real.stdout);
  assert.match(real.stdout, /legacy_candidates_2024/, "legacy table reported as skipped");
  const cands = await prisma.candidate.findMany({ where: { tenantId: tenant.id }, include: { jobOrder: true }, orderBy: { fullName: "asc" } });
  assert.deepEqual(cands.map((c) => c.fullName), ["Ana Lopez", "Bo Chen"], "legacy person not imported");
  assert.equal(cands[0].fitScore, 82);
  assert.equal(cands[0].jobOrder?.title, "CFO", "relations re-linked to new ids");
  assert.equal(cands[0].currentCompany, "Globex");
  assert.equal(await prisma.client.count({ where: { tenantId: tenant.id } }), 1);
  const msgs = await prisma.message.findMany({ where: { tenantId: tenant.id } });
  assert.equal(msgs.length, 2);
  assert.deepEqual(msgs.map((x) => [x.channel, x.direction]).sort(), [["EMAIL", "OUTBOUND"], ["SMS", "INBOUND"]]);
  assert.ok(msgs.every((x) => x.candidateId === cands[0].id));
  fs.rmSync(dir, { recursive: true, force: true });
  await prisma.tenant.delete({ where: { id: tenant.id } });
  await prisma.$disconnect();
});
