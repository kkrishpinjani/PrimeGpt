import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { prisma } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { hands, handsStatus, startGateway } from "../worker/gateway";
import { ChallengeError, parseProfileText, sourceLinkedIn, waitForHuman } from "../worker/drivers/browser-sources";
import { searchCandidates, upsertCandidate } from "@/lib/services/candidates";

const PORT = 4999;
const open = (token: string) =>
  new Promise<WebSocket>((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/executor?token=${token}`);
    ws.on("open", () => res(ws));
    ws.on("close", (c) => rej(new Error(`closed ${c}`)));
    ws.on("error", () => {});
  });

test("cloud ⇄ local-hands round trip", async (t) => {
  const wss = startGateway(PORT);
  const tenant = await prisma.tenant.create({ data: { name: "hands", slug: `hands-${Date.now()}` } });
  const token = randomToken();
  await prisma.executorDevice.create({ data: { tenantId: tenant.id, tokenHash: sha256(token) } });

  await t.test("bad token is rejected", async () => {
    const code = await new Promise<number>((res) => {
      const bad = new WebSocket(`ws://localhost:${PORT}/executor?token=nope`);
      bad.on("close", (c) => res(c));
      bad.on("error", () => {});
    });
    assert.equal(code, 4401);
  });

  const ws = await open(token);
  ws.send(JSON.stringify({ type: "hello", version: "t", platform: "test", browserConnected: true }));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    const data = m.action.op === "read" ? "hello world" : m.action.op === "readAll" ? ["a", "b"] : m.action.op === "detect_challenge" ? { challenge: false } : {};
    if (m.action.op === "click") return ws.send(JSON.stringify({ type: "result", id: m.id, ok: false, error: "no such element" }));
    ws.send(JSON.stringify({ type: "result", id: m.id, ok: true, data }));
  });
  await new Promise((r) => setTimeout(r, 300));

  await t.test("status reflects connection", () => assert.deepEqual(handsStatus(tenant.id), { online: true, browserConnected: true }));
  await t.test("primitives round-trip", async () => {
    const h = hands(tenant.id);
    assert.equal(await h.read("h1"), "hello world");
    assert.deepEqual(await h.readAll("a", "href"), ["a", "b"]);
    assert.deepEqual(await h.challenge(), { challenge: false });
    await assert.rejects(() => h.click("#x"), /no such element/);
  });
  await t.test("non-primitive commands never leave the cloud", async () => {
    const { hands: _h } = await import("../worker/gateway");
    await assert.rejects(async () => (hands(tenant.id) as any).navigate("javascript:alert(1)"), /./);
  });
  await t.test("offline tenant fails fast with a clear message", async () => {
    await assert.rejects(() => hands("nobody").read(), /offline/i);
  });

  ws.close();
  await new Promise((r) => setTimeout(r, 200));
  await prisma.tenant.delete({ where: { id: tenant.id } });
  wss.close();
});

const fakeHands = (opts: { challenge?: boolean } = {}) => ({
  navigate: async (u: string) => ({ url: u }),
  click: async () => ({}), type: async () => ({}), press: async () => ({}), scroll: async () => ({}),
  wait: async () => ({}), url: async () => "https://www.linkedin.com/x", screenshot: async () => "",
  read: async (sel?: string) => (sel === "h1" ? "Casey Rivera" : "Casey Rivera\nVP Finance at Globex | CPA\nChicago, Illinois, United States\nAbout\nLed SAP rollout"),
  readHtml: async () => "",
  readAll: async () => ["https://www.linkedin.com/talent/profile/AAA?x=1", "https://www.linkedin.com/talent/profile/BBB"],
  challenge: async () => (opts.challenge ? { challenge: true, kind: "captcha" } : { challenge: false }),
}) as any;

test("LinkedIn driver builds profiles from generic primitives only", async () => {
  const progress: string[] = [];
  const out = await sourceLinkedIn(fakeHands(), { titles: ["VP Finance"], keywords: ["SAP"], locations: ["Chicago"], max: 5 }, async (_n, _t, m) => { progress.push(m); });
  assert.equal(out.length, 2);
  assert.equal(out[0].fullName, "Casey Rivera");
  assert.equal(out[0].currentTitle, "VP Finance");
  assert.match(out[0].currentCompany ?? "", /Globex/);
  assert.equal(out[0].sourceRef, "https://www.linkedin.com/talent/profile/AAA", "tracking params stripped for dedupe");
});

test("captcha/verification halts the run and asks a human, never bypasses", async () => {
  await assert.rejects(() => sourceLinkedIn(fakeHands({ challenge: true }), { titles: [], keywords: [], locations: [], max: 3 }, async () => {}), ChallengeError);
  let n = 0;
  const h = { challenge: async () => ({ challenge: ++n < 2 }) } as any;
  const orig = global.setTimeout;
  (global as any).setTimeout = (fn: any) => orig(fn, 0);
  try { assert.equal(await waitForHuman(h, 5000), true); } finally { global.setTimeout = orig; }
});

test("profile text parser", () => {
  const p = parseProfileText("Casey Rivera", "Casey Rivera\n3rd degree connection\nVP Finance at Globex | CPA\nChicago, Illinois");
  assert.equal(p.currentTitle, "VP Finance");
});

test("full-text candidate search is tenant scoped", async () => {
  const A = await prisma.tenant.create({ data: { name: "fa", slug: `fa-${Date.now()}` } });
  const B = await prisma.tenant.create({ data: { name: "fb", slug: `fb-${Date.now()}` } });
  await upsertCandidate(A.id, { fullName: "Zed Quantum", source: "manual", currentTitle: "Controller", summary: "SAP S/4HANA migration lead" });
  await upsertCandidate(B.id, { fullName: "Yan Quantum", source: "manual", currentTitle: "Controller", summary: "SAP S/4HANA migration lead" });
  const r = await searchCandidates(A.id, "quantum SAP");
  assert.equal(r.length, 1);
  assert.equal(r[0].fullName, "Zed Quantum");
  assert.equal((await searchCandidates(A.id, "")).length, 0);
  assert.doesNotThrow(() => searchCandidates(A.id, "+-<>()~*\"@ weird (query"));
  // dedupe: same source+ref is an update, not a duplicate
  const [, isNew] = await upsertCandidate(A.id, { fullName: "Zed Quantum", source: "manual", currentTitle: "Controller", summary: "SAP S/4HANA migration lead" });
  assert.equal(isNew, false);
  await prisma.tenant.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  await prisma.$disconnect();
});
