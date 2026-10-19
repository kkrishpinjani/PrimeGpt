import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { hasActiveAccess } from "@/lib/billing-gate";
import { allow } from "@/lib/memory-ratelimit";
import { csvCell } from "@/lib/csv";
import { eraseCandidate } from "@/lib/services/erasure";
import { saveSecret } from "@/lib/integrations/store";
import { runMatchRole } from "../worker/jobs/match";
import { runProspecting } from "../worker/jobs/misc";
import { buildUnixScript, buildWindowsScript } from "@/lib/installer-scripts";

const slug = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const mkTenant = (name: string) => prisma.tenant.create({ data: { name, slug: slug(name), subscriptionStatus: "ACTIVE" } });
const cand = (tenantId: string, fullName: string, extra: Record<string, unknown> = {}) =>
  prisma.candidate.create({ data: { tenantId, fullName, source: "manual", sourceRef: `${fullName}-${Math.random()}`, ...extra } as any });

test("trial access ends on its date", () => {
  const future = new Date(Date.now() + 864e5), past = new Date(Date.now() - 864e5);
  assert.ok(hasActiveAccess({ subscriptionStatus: "TRIALING", currentPeriodEnd: future }));
  assert.ok(!hasActiveAccess({ subscriptionStatus: "TRIALING", currentPeriodEnd: past }), "expired trial is locked");
  assert.ok(hasActiveAccess({ subscriptionStatus: "TRIALING", currentPeriodEnd: null }));
  assert.ok(!hasActiveAccess({ subscriptionStatus: "NONE", currentPeriodEnd: future }));
});

test("rate limiter allows the limit, blocks the excess, and resets", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.ok(allow("k1", 5, 1000, t0 + i), `request ${i + 1}`);
  assert.equal(allow("k1", 5, 1000, t0 + 10), false, "6th blocked");
  assert.ok(allow("k2", 5, 1000, t0 + 10), "other keys unaffected");
  assert.ok(allow("k1", 5, 1000, t0 + 1500), "window reset");
});

test("CSV export neutralises formula injection and quotes properly", () => {
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(csvCell("+1 555"), "'+1 555");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell(null), "");
});

test("erasure removes the person and their messages, optionally blocks re-contact, and is tenant-scoped", async () => {
  const A = await mkTenant("era-a"), B = await mkTenant("era-b");
  const c = await cand(A.id, "Erase Me", { email: "erase@x.com" });
  const other = await cand(B.id, "Keep Me", { email: "keep@x.com" });
  await prisma.message.createMany({ data: [{ tenantId: A.id, candidateId: c.id, channel: "EMAIL", body: "hi" }, { tenantId: B.id, candidateId: other.id, channel: "EMAIL", body: "hi" }] });

  await assert.rejects(() => eraseCandidate(A.id, other.id, true), /not found/, "cannot erase another workspace's candidate");
  assert.equal(await prisma.candidate.count({ where: { id: other.id } }), 1);

  await eraseCandidate(A.id, c.id, true);
  assert.equal(await prisma.candidate.count({ where: { id: c.id } }), 0);
  assert.equal(await prisma.message.count({ where: { tenantId: A.id } }), 0, "messages erased too");
  assert.equal(await prisma.doNotContact.count({ where: { tenantId: A.id, email: "erase@x.com" } }), 1, "kept on do-not-contact");
  assert.equal(await prisma.message.count({ where: { tenantId: B.id } }), 1, "other workspace untouched");
  await prisma.tenant.deleteMany({ where: { id: { in: [A.id, B.id] } } });
});

test("match from database: ranks the talent pool against a role, scoped to the workspace", async () => {
  const A = await mkTenant("mt-a"), B = await mkTenant("mt-b");
  const job = await prisma.jobOrder.create({ data: { tenantId: A.id, title: "VP Finance", location: "Chicago, IL", mustHaves: "SAP S/4HANA implementation\nPE-backed company experience\nM&A integration" } });
  const strong = await cand(A.id, "Strong Match", { currentTitle: "VP Finance", currentCompany: "Apex", location: "Chicago, IL", summary: "Led SAP S/4HANA implementation at PE-backed manufacturer. M&A integration lead.", skills: "SAP, M&A" });
  const medium = await cand(A.id, "Medium Match", { currentTitle: "Finance Director", location: "Austin, TX", summary: "Finance leader, SAP user, budgeting" });
  await cand(A.id, "Unrelated Person", { currentTitle: "Barista", summary: "Coffee and customer service" });
  await cand(A.id, "Rejected Strong", { currentTitle: "VP Finance", summary: "SAP S/4HANA PE-backed M&A integration", status: "REJECTED" });
  const attached = await cand(A.id, "Already Attached", { currentTitle: "VP Finance", summary: "SAP S/4HANA", jobOrderId: job.id });
  await cand(B.id, "Other Tenant Star", { currentTitle: "VP Finance", summary: "SAP S/4HANA implementation PE-backed M&A integration Chicago" });

  const mkRun = () => prisma.run.create({ data: { tenantId: A.id, type: "MATCH_ROLE", params: { jobOrderId: job.id } } });
  const msg = await runMatchRole(await mkRun());
  assert.match(msg, /Ranked \d+ people/);
  const matches = await prisma.jobMatch.findMany({ where: { jobOrderId: job.id }, orderBy: { score: "desc" }, include: { candidate: true } });
  const names = matches.map((m) => m.candidate.fullName);
  assert.equal(names[0], "Strong Match", "best candidate ranks first");
  assert.ok(names.indexOf("Strong Match") < names.indexOf("Medium Match"));
  assert.ok(!names.includes("Rejected Strong"), "rejected people are excluded");
  assert.ok(!names.includes("Already Attached"), "people already on the shortlist are excluded");
  assert.ok(!names.includes("Other Tenant Star"), "never reads another workspace");
  assert.ok(matches.every((m) => m.tenantId === A.id));
  // re-running updates instead of duplicating
  await runMatchRole(await mkRun());
  assert.equal(await prisma.jobMatch.count({ where: { jobOrderId: job.id, candidateId: strong.id } }), 1);
  void medium; void attached;
  await prisma.tenant.deleteMany({ where: { id: { in: [A.id, B.id] } } });
});

test("prospecting: web-search companies, then enrich with a decision maker (APIs stubbed)", async () => {
  const t = await mkTenant("pr");
  await saveSecret(t.id, "exa", { apiKey: "test-exa-key" });
  await saveSecret(t.id, "apollo", { apiKey: "test-apollo-key" });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    if (u.includes("api.exa.ai")) {
      return Response.json({ results: [
        { title: "Acme Manufacturing - Home", url: "https://www.acme-mfg.com/careers", text: "Acme builds industrial valves. Hiring a VP Finance." },
        { title: "Globex Corp | About", url: "https://globex.com/about", text: "Globex is expanding." },
      ] });
    }
    if (u.includes("api.apollo.io")) {
      return Response.json({ people: [{ id: "p1", name: "Casey Buyer", title: "Chief People Officer", email: "casey@acme-mfg.com", linkedin_url: "https://linkedin.com/in/caseybuyer", organization: { name: "Acme Manufacturing", primary_domain: "acme-mfg.com" } }] });
    }
    throw new Error("unexpected fetch " + u);
  }) as any;
  try {
    const msg = await runProspecting({ id: "none", tenantId: t.id, params: { mode: "companies", query: "valve manufacturers", userName: "Pat" } } as any);
    assert.match(msg, /Found 2 new companies/);
    const acme = await prisma.prospect.findFirstOrThrow({ where: { tenantId: t.id, domain: "acme-mfg.com" } });
    assert.equal(acme.company, "Acme Manufacturing", "company parsed from the page title");
    assert.equal(acme.contactEmail, null, "no contact until enriched");

    await runProspecting({ id: "none", tenantId: t.id, params: { mode: "companies", userName: "Pat" } } as any);
    assert.equal(await prisma.prospect.count({ where: { tenantId: t.id } }), 2, "no duplicates on re-run");

    const out = await runProspecting({ id: "none", tenantId: t.id, params: { mode: "enrich", prospectId: acme.id, userName: "Pat" } } as any);
    assert.match(out, /Enriched Acme Manufacturing: Casey Buyer/);
    const enriched = await prisma.prospect.findUniqueOrThrow({ where: { id: acme.id } });
    assert.equal(enriched.contactName, "Casey Buyer");
    const contact = await prisma.contact.findFirstOrThrow({ where: { tenantId: t.id, email: "casey@acme-mfg.com" } });
    const draft = await prisma.message.findFirstOrThrow({ where: { tenantId: t.id, contactId: contact.id } });
    assert.equal(draft.status, "DRAFT", "intro is a draft awaiting approval");
    await assert.rejects(() => runProspecting({ id: "none", tenantId: t.id, params: { mode: "enrich", prospectId: "nope", userName: "Pat" } } as any), /not found/);
  } finally {
    globalThis.fetch = realFetch;
  }
  await prisma.tenant.delete({ where: { id: t.id } });
});

test("installer scripts: valid shell, correct embedding, CRLF for Windows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rgpt-inst-"));
  for (const kind of ["mac", "linux"] as const) {
    const sh = buildUnixScript(kind, "https://recruitgpt.ai", "ABCD-1234");
    assert.match(sh, /^#!\/usr\/bin\/env bash/);
    assert.match(sh, /CODE="ABCD-1234"/);
    assert.match(sh, /SERVER="https:\/\/recruitgpt\.ai"/);
    assert.ok(kind === "mac" ? sh.includes("launchctl") : sh.includes("systemctl --user"));
    assert.ok(!/\r/.test(sh), "unix script must use LF");
    const f = path.join(dir, `${kind}.sh`);
    fs.writeFileSync(f, sh);
    const r = spawnSync("bash", ["-n", f], { encoding: "utf8" });
    assert.equal(r.status, 0, `bash -n failed for ${kind}: ${r.stderr}`);
  }
  const win = buildWindowsScript("https://recruitgpt.ai", "ABCD-1234");
  assert.ok(win.includes('set "CODE=ABCD-1234"') && win.includes("\r\n") && !/[^\r]\n/.test(win), "Windows script is CRLF throughout");
  fs.rmSync(dir, { recursive: true, force: true });
});

test.after(async () => { await prisma.$disconnect(); });
