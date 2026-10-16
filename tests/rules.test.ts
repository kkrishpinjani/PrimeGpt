import test from "node:test";
import assert from "node:assert/strict";
import { compLine, compMentioned, enforceVoiceAndComp } from "@/lib/brain/rules";
import { classifyInbound } from "@/lib/brain/inbox";
import { heuristicScore } from "@/lib/brain/scoring";
import { hasActiveAccess } from "@/lib/billing-gate";

const job = (o: any = {}) => ({ id: "j", tenantId: "t", title: "VP Finance", location: "Chicago", description: null, mustHaves: "SAP S/4HANA\nPE-backed experience\nM&A integration", niceToHaves: "CPA", compMin: 250000, compMax: 300000, compCurrency: "USD", discloseComp: false, ...o }) as any;
const cand = (o: any = {}) => ({ id: "c", fullName: "Pat Doe", headline: "VP Finance at Acme", currentTitle: "VP Finance", currentCompany: "Acme", location: "Chicago, IL", summary: "SAP S/4HANA rollout, PE-backed company, led M&A integration, CPA", skills: "SAP, M&A", rawProfile: null, ...o }) as any;

test("comp disclosure branching", () => {
  assert.ok(compMentioned("The base is $250k"));
  assert.ok(compMentioned("competitive salary"));
  assert.ok(!enforceVoiceAndComp({ subject: "Role", body: "Salary is 250k" }, "EMAIL", { discloseComp: false }).ok);
  assert.ok(enforceVoiceAndComp({ subject: "Role", body: "Salary is 250k" }, "EMAIL", { discloseComp: true }).ok);
  assert.equal(compLine(job()), null);
  assert.match(compLine(job({ discloseComp: true }))!, /250,000 to USD 300,000|USD 250,000 to USD 300,000/);
});

test("voice rules: banned phrases flagged, em dashes removed", () => {
  const r = enforceVoiceAndComp({ subject: null, body: "An amazing opportunity — you would be a rockstar" }, "EMAIL", { discloseComp: false });
  assert.ok(!r.ok);
  assert.ok(!r.body.includes("—"));
});

test("SMS gets opt-out line and length cap", () => {
  const r = enforceVoiceAndComp({ subject: "x", body: "Hi there. ".repeat(60) }, "SMS", { discloseComp: false });
  assert.equal(r.subject, null);
  assert.ok(r.body.length <= 320);
  assert.match(r.body, /STOP/i);
});

test("opt-outs never depend on a model", async () => {
  for (const t of ["STOP", "stop.", "Please remove me from your list", "do not contact me again"]) assert.equal((await classifyInbound("t", t)).label, "unsubscribe", t);
  assert.equal((await classifyInbound("t", "I'm out of office until Monday")).label, "out_of_office");
  assert.equal((await classifyInbound("t", "STOP")).suggestedReply, null);
});

test("heuristic scorer rewards evidence and punishes gaps", () => {
  const good = heuristicScore(job(), cand());
  const poor = heuristicScore(job(), cand({ fullName: "Sam", headline: "Barista", currentTitle: "Barista", summary: "coffee", skills: "latte", location: "Austin, TX" }));
  assert.ok(good.score > poor.score + 25, `${good.score} vs ${poor.score}`);
  assert.ok(poor.gaps.length >= 2);
  assert.ok(good.score >= 0 && good.score <= 100);
});

test("subscription gate", () => {
  assert.ok(hasActiveAccess({ subscriptionStatus: "ACTIVE", currentPeriodEnd: null }));
  assert.ok(!hasActiveAccess({ subscriptionStatus: "NONE", currentPeriodEnd: null }));
  assert.ok(!hasActiveAccess({ subscriptionStatus: "CANCELED", currentPeriodEnd: new Date(Date.now() + 1e9) }));
  assert.ok(hasActiveAccess({ subscriptionStatus: "PAST_DUE", currentPeriodEnd: new Date() }), "grace window");
  assert.ok(!hasActiveAccess({ subscriptionStatus: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - 10 * 864e5) }));
});
