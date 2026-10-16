import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Primitive, CloudToExecutor, hostAllowed, MAX_TYPE_CHARS } from "@/lib/protocol";
import { SCORING_SYSTEM, OUTREACH_SYSTEM, BRIEF_SYSTEM, VOICE } from "@/lib/brain/prompts";

/** WS7: only generic browser primitives may cross to a customer's machine. */
const root = path.resolve(__dirname, "..");

test("protocol rejects anything that is not a generic primitive", () => {
  assert.ok(Primitive.safeParse({ op: "navigate", url: "https://www.linkedin.com/talent/search" }).success);
  for (const bad of [
    { op: "run_skill", name: "score" },
    { op: "prompt", text: SCORING_SYSTEM },
    { op: "eval", code: "1+1" },
    { op: "type", selector: "a", text: "x".repeat(MAX_TYPE_CHARS + 1) },
    { op: "click" },
    { op: "navigate", url: "not a url" },
  ]) assert.equal(Primitive.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 60));
  assert.equal(CloudToExecutor.safeParse({ id: "1", type: "cmd", action: { op: "navigate", url: "https://linkedin.com/x" }, extra: SCORING_SYSTEM }).success, true, "unknown top-level keys are stripped, not forwarded");
  const parsed = CloudToExecutor.parse({ id: "1", type: "cmd", action: { op: "navigate", url: "https://linkedin.com/x" }, extra: SCORING_SYSTEM });
  assert.equal((parsed as any).extra, undefined);
});

test("host allowlist is https + linkedin/indeed only", () => {
  assert.ok(hostAllowed("https://www.linkedin.com/in/x"));
  assert.ok(hostAllowed("https://employers.indeed.com/candidates"));
  assert.ok(!hostAllowed("http://www.linkedin.com/in/x"));
  assert.ok(!hostAllowed("https://linkedin.com.evil.com/"));
  assert.ok(!hostAllowed("https://evil.com/?u=linkedin.com"));
});

test("executor package contains no recruiting IP and its protocol copy is identical", () => {
  const src = fs.readFileSync(path.join(root, "executor/src/index.ts"), "utf8");
  const proto = fs.readFileSync(path.join(root, "executor/src/protocol.ts"), "utf8");
  assert.equal(proto, fs.readFileSync(path.join(root, "src/lib/protocol.ts"), "utf8"), "run: cp src/lib/protocol.ts executor/src/protocol.ts");
  for (const secret of [SCORING_SYSTEM, OUTREACH_SYSTEM, BRIEF_SYSTEM, VOICE]) {
    const probe = secret.slice(20, 80);
    assert.ok(!src.includes(probe) && !proto.includes(probe), "prompt text found in executor");
  }
  assert.ok(!/brain\//.test(src), "executor must not import the brain");
  assert.ok(!/anthropic|ANTHROPIC/i.test(src + proto), "executor must not reference the AI provider");
});

test("brain code is never imported by client components or the executor", () => {
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(path.join(root, "src")).filter((f) => /\.tsx?$/.test(f))) {
    const body = fs.readFileSync(f, "utf8");
    if (/^["']use client["']/.test(body)) assert.ok(!/lib\/brain|SCORING_SYSTEM/.test(body), `client component imports brain: ${f}`);
  }
});
